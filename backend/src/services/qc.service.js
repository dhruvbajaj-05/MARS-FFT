'use strict';

const mongoose = require('mongoose');
const QCRecord = require('../models/QCRecord');
const MediaAsset = require('../models/MediaAsset');
const Order = require('../models/Order');
const Product = require('../models/Product');
const assemblyService = require('./assembly.service');
const storeService = require('./store.service');
const { ROLES } = require('../utils/roles');
const { badRequest, notFound, forbidden, conflict } = require('../utils/httpError');
const { parsePagination, buildList } = require('../utils/pagination');

// Engineer may edit/delete within 12 hours of record creation (mirrors moulding).
const EDIT_WINDOW_MS = 12 * 60 * 60 * 1000;

// Move Finished Goods by the change in approved units (QC feeds the Finished Goods store
// with a raw ledger entry, so edits/deletes must reverse it). A guarded decrement that
// fails means those units were already dispatched — surface a clear 409.
async function adjustFinishedGoods(record, delta, createdBy, remarks) {
  if (!delta) return;
  try {
    if (delta > 0) {
      await storeService.applyStockIn({
        storeType: storeService.STORE.FINISHED_GOODS,
        customerId: record.customerId, productId: record.productId,
        quantity: delta, sourceModule: 'qc', referenceId: record._id, remarks, createdBy,
      });
    } else {
      await storeService.applyStockOut({
        storeType: storeService.STORE.FINISHED_GOODS,
        customerId: record.customerId, productId: record.productId,
        quantity: -delta, sourceModule: 'qc', referenceId: record._id, remarks, createdBy,
      });
    }
  } catch (err) {
    if (err && err.code === 'insufficient_stock') {
      throw conflict(
        'Some of these approved units have already been dispatched, so this QC record can no longer be changed or removed.',
        'qc_already_dispatched'
      );
    }
    throw err;
  }
}

// ---- Order-level QC status (computed at read time; never stored).
// QC inspects Assembly good output, so progress is measured against assembled units:
//   Pending     → no QC records submitted yet
//   In Progress → records exist but not all assembled units inspected yet
//   Passed      → all assembled units inspected AND no rejections
//   Failed      → all assembled units inspected AND one or more rejections
// (No AQL/acceptance threshold is defined in V1 — any rejection fails the lot.)
function deriveStatus({ recordCount, totalInspected, totalRejected }, assemblyGoodOutput) {
  if (recordCount === 0) return 'Pending';
  if (assemblyGoodOutput <= 0 || totalInspected < assemblyGoodOutput) return 'In Progress';
  return totalRejected === 0 ? 'Passed' : 'Failed';
}

// Aggregate QC figures for one order.
async function aggregateQC(orderId) {
  const [agg] = await QCRecord.aggregate([
    { $match: { orderId: new mongoose.Types.ObjectId(orderId) } },
    {
      $group: {
        _id: null,
        totalInspected: { $sum: '$sampleSize' },
        totalAccepted: { $sum: '$acceptedQuantity' },
        totalRejected: { $sum: '$rejectedQuantity' },
        totalDefects: { $sum: '$defectCount' },
        recordCount: { $sum: 1 },
      },
    },
  ]);
  return agg || {
    totalInspected: 0, totalAccepted: 0, totalRejected: 0, totalDefects: 0, recordCount: 0,
  };
}

// Compute the integrated QC status for an order, pulling Assembly good output from
// the Assembly module so the stages line up (Assembly good output → QC inspection).
async function computeOrderStatus(orderId) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw badRequest('Invalid orderId', 'invalid_id');
  }
  const order = await Order.findById(orderId);
  if (!order) {
    throw notFound('Order not found', 'order_not_found');
  }

  const assembly = await assemblyService.computeOrderStatus(orderId);
  const assemblyGoodOutput = assembly.assembledQuantity; // good assembled units available to inspect
  const sums = await aggregateQC(order._id);

  const status = deriveStatus(sums, assemblyGoodOutput);
  const progressPct = assemblyGoodOutput > 0
    ? Math.min(100, Math.round((sums.totalInspected / assemblyGoodOutput) * 100))
    : 0;

  return {
    orderId: order._id.toString(),
    customerId: order.customerId.toString(),
    productId: order.productId.toString(),
    orderQuantity: order.orderQuantity,
    assemblyGoodOutput,
    inspectedQuantity: sums.totalInspected,
    acceptedQuantity: sums.totalAccepted,
    rejectedQuantity: sums.totalRejected,
    defectCount: sums.totalDefects,
    pendingQuantity: Math.max(0, assemblyGoodOutput - sums.totalInspected),
    progressPct,
    recordCount: sums.recordCount,
    status,
    // Nested upstream status so consumers (Dispatch, admin) see the full chain.
    assemblyStatus: {
      assembledQuantity: assembly.assembledQuantity,
      mouldingOutput: assembly.mouldingOutput,
      status: assembly.status,
    },
  };
}

// Shape a QC record for client responses. Handles `photos` populated or raw.
function toPublicQCRecord(record) {
  const photos = (record.photos || []).map((p) =>
    p && p.url
      ? { id: p._id.toString(), url: p.url, type: p.type, mimeType: p.mimeType, sizeBytes: p.sizeBytes }
      : { id: p.toString() }
  );
  return {
    id: record._id.toString(),
    orderId: record.orderId ? record.orderId.toString() : null,
    customerId: record.customerId.toString(),
    productId: record.productId.toString(),
    inspectionDate: record.inspectionDate,
    inspectionType: record.inspectionType,
    sampleSize: record.sampleSize,
    acceptedQuantity: record.acceptedQuantity,
    rejectedQuantity: record.rejectedQuantity,
    defectCount: record.defectCount,
    defects: (record.defects || []).map((d) => ({
      defectType: d.defectType,
      quantity: d.quantity,
      remarks: d.remarks || null,
    })),
    correctiveAction: record.correctiveAction || null,
    remarks: record.remarks || null,
    photos,
    submittedBy: record.submittedBy.toString(),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    canEdit: (Date.now() - new Date(record.createdAt).getTime()) < EDIT_WINDOW_MS,
  };
}

// Parse defects[] which may arrive as a JSON string (multipart) or an array (JSON body).
function parseDefects(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch (e) {
      throw badRequest('defects must be a JSON array', 'invalid_defects');
    }
  }
  if (!Array.isArray(value)) {
    throw badRequest('defects must be an array', 'invalid_defects');
  }
  return value.map((d, i) => {
    if (!d || typeof d.defectType !== 'string' || d.defectType.trim() === '') {
      throw badRequest(`defects[${i}].defectType is required`, 'invalid_defects');
    }
    const quantity = Number(d.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) {
      throw badRequest(`defects[${i}].quantity must be a number >= 1`, 'invalid_defects');
    }
    return {
      defectType: d.defectType.trim(),
      quantity,
      remarks: d.remarks ? String(d.remarks).trim() : undefined,
    };
  });
}

// Validate + coerce numeric fields and the inspection date, throwing clean 400s.
function normalizeFields(input) {
  const numbers = {};
  for (const key of ['sampleSize', 'acceptedQuantity', 'rejectedQuantity', 'defectCount']) {
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < 0) {
      throw badRequest(`${key} must be a number >= 0`, 'invalid_quantity');
    }
    numbers[key] = value;
  }

  const inspectionDate = new Date(input.inspectionDate);
  if (Number.isNaN(inspectionDate.getTime())) {
    throw badRequest('inspectionDate must be a valid date', 'invalid_date');
  }

  // Logical integrity: accepted + rejected cannot exceed the sample inspected.
  if (numbers.acceptedQuantity + numbers.rejectedQuantity > numbers.sampleSize) {
    throw badRequest(
      'acceptedQuantity + rejectedQuantity cannot exceed sampleSize',
      'inconsistent_quantities'
    );
  }

  return { ...numbers, inspectionDate };
}

// Validate the Customer + Product relationship. orderId is OPTIONAL (Phase 4): when
// present it must be consistent; when absent the record is anchored on Customer + Product.
async function validateChain({ orderId, productId, customerId }) {
  for (const [key, value] of Object.entries({ productId, customerId })) {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw badRequest(`Invalid ${key}`, 'invalid_id');
    }
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw badRequest('productId does not reference an existing product', 'invalid_product');
  }
  if (product.customerId.toString() !== String(customerId)) {
    throw badRequest('productId does not belong to the given customerId', 'product_customer_mismatch');
  }

  if (orderId !== undefined && orderId !== null && orderId !== '') {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw badRequest('Invalid orderId', 'invalid_id');
    }
    const order = await Order.findById(orderId);
    if (!order) {
      throw badRequest('orderId does not reference an existing order', 'invalid_order');
    }
    if (order.productId.toString() !== String(productId)) {
      throw badRequest('productId does not match the order', 'product_order_mismatch');
    }
    if (order.customerId.toString() !== String(customerId)) {
      throw badRequest('customerId does not match the order', 'customer_order_mismatch');
    }
  }
  return product;
}

// Create a QC record (QC engineer only). Phase 4: store-driven — QC-approved
// (accepted) units flow into the Finished Goods Store. The old per-order assembly
// cap is removed; only internal quantity/defect consistency is enforced.
async function createQCRecord({ payload, files, submittedBy }) {
  await validateChain(payload);
  const fields = normalizeFields(payload);
  const defects = parseDefects(payload.defects);

  // Defects explain rejections — total defect units cannot exceed rejected units.
  const defectUnits = defects.reduce((sum, d) => sum + d.quantity, 0);
  if (defectUnits > fields.rejectedQuantity) {
    throw badRequest(
      'Sum of defects[].quantity cannot exceed rejectedQuantity',
      'inconsistent_defects'
    );
  }

  const orderId =
    payload.orderId !== undefined && payload.orderId !== null && payload.orderId !== ''
      ? payload.orderId
      : null;

  const record = await QCRecord.create({
    orderId,
    customerId: payload.customerId,
    productId: payload.productId,
    inspectionDate: fields.inspectionDate,
    inspectionType: String(payload.inspectionType).trim(),
    sampleSize: fields.sampleSize,
    acceptedQuantity: fields.acceptedQuantity,
    rejectedQuantity: fields.rejectedQuantity,
    defectCount: fields.defectCount,
    defects,
    correctiveAction: payload.correctiveAction ? String(payload.correctiveAction).trim() : undefined,
    remarks: payload.remarks ? String(payload.remarks).trim() : undefined,
    submittedBy,
  });

  // Finished Goods Store: approved units become finished goods (Customer → Product).
  if (fields.acceptedQuantity > 0) {
    await storeService.applyStockIn({
      storeType: storeService.STORE.FINISHED_GOODS,
      customerId: payload.customerId,
      productId: payload.productId,
      quantity: fields.acceptedQuantity,
      sourceModule: 'qc',
      referenceId: record._id,
      remarks: `QC approved (${String(payload.inspectionType).trim()})`,
      createdBy: submittedBy,
    });
  }

  // Attach uploaded photos (if any) — record first, then media, then link.
  if (files && files.length > 0) {
    const { publicUrlFor } = require('../middleware/upload');
    const media = await MediaAsset.insertMany(
      files.map((f) => ({
        type: 'image',
        url: publicUrlFor(f.path),
        mimeType: f.mimetype,
        sizeBytes: f.size,
        ownerType: 'qc',
        ownerId: record._id,
        uploadedBy: submittedBy,
      }))
    );
    record.photos = media.map((m) => m._id);
    await record.save();
    record.photos = media;
  }

  const orderStatus = orderId ? await computeOrderStatus(orderId) : null;
  const finishedGoods = await storeService.getFinishedGoodsBalance(
    payload.customerId,
    payload.productId
  );
  return { record: toPublicQCRecord(record), orderStatus, finishedGoods };
}

// Edit a QC record within the 12-hour window (own record only). Adjusts Finished Goods
// by the change in approved (accepted) units.
async function updateQCRecord(id, payload, user) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid id', 'invalid_id');
  const record = await QCRecord.findById(id);
  if (!record) throw notFound('QC record not found', 'qc_record_not_found');
  if (record.submittedBy.toString() !== String(user.id)) {
    throw forbidden('You can only edit your own QC records');
  }
  if (Date.now() - new Date(record.createdAt).getTime() > EDIT_WINDOW_MS) {
    throw forbidden('Edit window has expired (12 hours after creation)', 'edit_window_expired');
  }

  const merged = {
    sampleSize: payload.sampleSize !== undefined ? payload.sampleSize : record.sampleSize,
    acceptedQuantity: payload.acceptedQuantity !== undefined ? payload.acceptedQuantity : record.acceptedQuantity,
    rejectedQuantity: payload.rejectedQuantity !== undefined ? payload.rejectedQuantity : record.rejectedQuantity,
    defectCount: payload.defectCount !== undefined ? payload.defectCount : record.defectCount,
    inspectionDate: payload.inspectionDate !== undefined ? payload.inspectionDate : record.inspectionDate,
  };
  const fields = normalizeFields(merged);
  const defects = payload.defects !== undefined ? parseDefects(payload.defects) : record.defects;
  const defectUnits = defects.reduce((sum, d) => sum + d.quantity, 0);
  if (defectUnits > fields.rejectedQuantity) {
    throw badRequest('Sum of defects[].quantity cannot exceed rejectedQuantity', 'inconsistent_defects');
  }

  const oldAccepted = record.acceptedQuantity;

  record.sampleSize = fields.sampleSize;
  record.acceptedQuantity = fields.acceptedQuantity;
  record.rejectedQuantity = fields.rejectedQuantity;
  record.defectCount = fields.defectCount;
  record.inspectionDate = fields.inspectionDate;
  record.defects = defects;
  if (payload.inspectionType !== undefined) record.inspectionType = String(payload.inspectionType).trim();
  if (payload.correctiveAction !== undefined) {
    record.correctiveAction = payload.correctiveAction ? String(payload.correctiveAction).trim() : undefined;
  }
  if (payload.remarks !== undefined) {
    record.remarks = payload.remarks ? String(payload.remarks).trim() : undefined;
  }

  // Reverse the finished-goods delta BEFORE persisting field changes, so a "already
  // dispatched" block leaves the record untouched.
  await adjustFinishedGoods(record, fields.acceptedQuantity - oldAccepted, user.id, `QC edit (${record.inspectionType})`);
  await record.save();

  return toPublicQCRecord(record);
}

// Delete a QC record within the 12-hour window (own record only). Reverses the approved
// units that were pushed into Finished Goods.
async function deleteQCRecord(id, user) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid id', 'invalid_id');
  const record = await QCRecord.findById(id);
  if (!record) throw notFound('QC record not found', 'qc_record_not_found');
  if (record.submittedBy.toString() !== String(user.id)) {
    throw forbidden('You can only delete your own QC records');
  }
  if (Date.now() - new Date(record.createdAt).getTime() > EDIT_WINDOW_MS) {
    throw forbidden('Delete window has expired (12 hours after creation)', 'delete_window_expired');
  }

  if (record.acceptedQuantity > 0) {
    await adjustFinishedGoods(record, -record.acceptedQuantity, user.id, 'QC record deleted');
  }
  await QCRecord.deleteOne({ _id: record._id });
  return { deleted: true };
}

// Shared filter builder for list queries.
function buildFilter(query) {
  const filter = {};
  for (const key of ['customerId', 'productId', 'orderId']) {
    if (query[key]) {
      if (!mongoose.Types.ObjectId.isValid(query[key])) {
        throw badRequest(`Invalid ${key}`, 'invalid_id');
      }
      filter[key] = query[key];
    }
  }
  return filter;
}

// List QC records for the whole department — every QC engineer sees all records, not just
// their own (shared visibility, req #8). Optional customer/product/order filters still apply.
async function listMyRecords(_submittedBy, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildFilter(query);

  const [items, total] = await Promise.all([
    QCRecord.find(filter).populate('photos').sort({ createdAt: -1 }).skip(skip).limit(limit),
    QCRecord.countDocuments(filter),
  ]);
  return buildList(items.map(toPublicQCRecord), total, page, limit);
}

// Admin read-all across customers/orders (GET /qc), with optional filters.
async function listAllRecords(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildFilter(query);
  if (query.submittedBy && mongoose.Types.ObjectId.isValid(query.submittedBy)) {
    filter.submittedBy = query.submittedBy;
  }

  const [items, total] = await Promise.all([
    QCRecord.find(filter).populate('photos').sort({ createdAt: -1 }).skip(skip).limit(limit),
    QCRecord.countDocuments(filter),
  ]);
  return buildList(items.map(toPublicQCRecord), total, page, limit);
}

// Fetch one record. Admin may read any; a QC engineer may read only their own.
async function getRecordById(id, user) {
  const record = await QCRecord.findById(id).populate('photos');
  if (!record) {
    throw notFound('QC record not found', 'qc_record_not_found');
  }
  if (user.role !== ROLES.ADMIN && user.role !== ROLES.QC_ENGINEER) {
    throw forbidden('Access denied');
  }
  return toPublicQCRecord(record);
}

module.exports = {
  createQCRecord,
  updateQCRecord,
  deleteQCRecord,
  listMyRecords,
  listAllRecords,
  getRecordById,
  computeOrderStatus,
  toPublicQCRecord,
};
