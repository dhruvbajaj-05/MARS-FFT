'use strict';

const mongoose = require('mongoose');
const PackingDispatchRecord = require('../models/PackingDispatchRecord');
const MediaAsset = require('../models/MediaAsset');
const Order = require('../models/Order');
const Product = require('../models/Product');
const qcService = require('./qc.service');
const storeService = require('./store.service');
const { ROLES } = require('../utils/roles');
const { badRequest, notFound, forbidden } = require('../utils/httpError');
const { parsePagination, buildList } = require('../utils/pagination');

// ---- Order-level dispatch status (computed at read time; never stored).
// Dispatch ships QC-approved (accepted) units, so progress is measured against the
// QC approved quantity:
//   Pending             → nothing approved by QC yet (nothing ready to ship)
//   Ready For Dispatch  → QC has approved units but none dispatched yet
//   Partially Dispatched→ some, but not all, approved units dispatched
//   Dispatched          → all approved units dispatched
function deriveStatus({ totalDispatched }, qcApproved) {
  if (qcApproved <= 0) return 'Pending';
  if (totalDispatched <= 0) return 'Ready For Dispatch';
  if (totalDispatched < qcApproved) return 'Partially Dispatched';
  return 'Dispatched';
}

// Aggregate dispatch figures for one order.
async function aggregateDispatch(orderId) {
  const [agg] = await PackingDispatchRecord.aggregate([
    { $match: { orderId: new mongoose.Types.ObjectId(orderId) } },
    {
      $group: {
        _id: null,
        totalDispatched: { $sum: '$packedQuantity' },
        totalCartons: { $sum: '$cartonCount' },
        recordCount: { $sum: 1 },
      },
    },
  ]);
  return agg || { totalDispatched: 0, totalCartons: 0, recordCount: 0 };
}

// Compute the integrated dispatch status for an order, pulling QC approved quantity
// from the QC module so the stages line up (QC approved → Dispatch).
async function computeOrderStatus(orderId) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw badRequest('Invalid orderId', 'invalid_id');
  }
  const order = await Order.findById(orderId);
  if (!order) {
    throw notFound('Order not found', 'order_not_found');
  }

  const qc = await qcService.computeOrderStatus(orderId);
  const qcApproved = qc.acceptedQuantity; // QC-accepted units available to dispatch
  const sums = await aggregateDispatch(order._id);

  const status = deriveStatus(sums, qcApproved);
  const progressPct = qcApproved > 0
    ? Math.min(100, Math.round((sums.totalDispatched / qcApproved) * 100))
    : 0;

  return {
    orderId: order._id.toString(),
    customerId: order.customerId.toString(),
    productId: order.productId.toString(),
    orderQuantity: order.orderQuantity,
    qcApprovedQuantity: qcApproved,
    dispatchedQuantity: sums.totalDispatched,
    cartonCount: sums.totalCartons,
    pendingQuantity: Math.max(0, qcApproved - sums.totalDispatched),
    progressPct,
    recordCount: sums.recordCount,
    status,
    // Nested upstream status so consumers (admin, customer dashboard) see the chain.
    qcStatus: {
      acceptedQuantity: qc.acceptedQuantity,
      rejectedQuantity: qc.rejectedQuantity,
      status: qc.status,
    },
  };
}

// Map a populated/raw MediaAsset to the public media shape.
function toMedia(p) {
  return p && p.url
    ? { id: p._id.toString(), url: p.url, type: p.type, mimeType: p.mimeType, sizeBytes: p.sizeBytes }
    : { id: p.toString() };
}

// Shape a dispatch record for client responses.
function toPublicDispatchRecord(record) {
  return {
    id: record._id.toString(),
    orderId: record.orderId ? record.orderId.toString() : null,
    customerId: record.customerId.toString(),
    productId: record.productId.toString(),
    dispatchDate: record.dispatchDate,
    packedQuantity: record.packedQuantity,
    cartonCount: record.cartonCount,
    transporterName: record.transporterName,
    vehicleNumber: record.vehicleNumber,
    lrNumber: record.lrNumber,
    invoiceNumber: record.invoiceNumber,
    dispatchRemarks: record.dispatchRemarks || null,
    photos: (record.photos || []).map(toMedia),
    documents: (record.documents || []).map(toMedia),
    submittedBy: record.submittedBy.toString(),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

// Validate + coerce numeric fields and the dispatch date, throwing clean 400s.
function normalizeFields(input) {
  const numbers = {};
  for (const key of ['packedQuantity', 'cartonCount']) {
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < 0) {
      throw badRequest(`${key} must be a number >= 0`, 'invalid_quantity');
    }
    numbers[key] = value;
  }

  const dispatchDate = new Date(input.dispatchDate);
  if (Number.isNaN(dispatchDate.getTime())) {
    throw badRequest('dispatchDate must be a valid date', 'invalid_date');
  }
  return { ...numbers, dispatchDate };
}

// Validate the Customer + Product relationship. orderId is OPTIONAL (Phase 5): when
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

// Persist uploaded files of one kind as MediaAssets linked to the record.
async function attachMedia(filesList, { type, ownerId, uploadedBy }) {
  if (!filesList || filesList.length === 0) return [];
  const { publicUrlFor } = require('../middleware/upload');
  const media = await MediaAsset.insertMany(
    filesList.map((f) => ({
      type,
      url: publicUrlFor(f.path),
      mimeType: f.mimetype,
      sizeBytes: f.size,
      ownerType: 'packing_dispatch',
      ownerId,
      uploadedBy,
    }))
  );
  return media;
}

// Create a dispatch record (dispatch engineer only). Phase 5: ships from the Finished
// Goods Store — the dispatched quantity is validated against available finished goods
// and atomically deducted (stock-OUT). Replaces the old per-order QC-approved cap.
async function createDispatchRecord({ payload, files, submittedBy }) {
  await validateChain(payload);
  const fields = normalizeFields(payload);

  const orderId =
    payload.orderId !== undefined && payload.orderId !== null && payload.orderId !== ''
      ? payload.orderId
      : null;

  // ---- Finished Goods integration: cannot dispatch more than is on hand. Pre-check
  // gives a clean error before the immutable record is written; the atomic guarded
  // decrement below is the real safety net against concurrent dispatches.
  if (fields.packedQuantity > 0) {
    const fg = await storeService.getFinishedGoodsBalance(payload.customerId, payload.productId);
    if (fields.packedQuantity > fg.quantityOnHand) {
      throw badRequest(
        `Dispatch quantity ${fields.packedQuantity} exceeds available finished goods ` +
          `(${fg.quantityOnHand}) for this product`,
        'exceeds_finished_goods'
      );
    }
  }

  const record = await PackingDispatchRecord.create({
    orderId,
    customerId: payload.customerId,
    productId: payload.productId,
    dispatchDate: fields.dispatchDate,
    packedQuantity: fields.packedQuantity,
    cartonCount: fields.cartonCount,
    transporterName: String(payload.transporterName).trim(),
    vehicleNumber: String(payload.vehicleNumber).trim(),
    lrNumber: String(payload.lrNumber).trim(),
    invoiceNumber: String(payload.invoiceNumber).trim(),
    dispatchRemarks: payload.dispatchRemarks ? String(payload.dispatchRemarks).trim() : undefined,
    submittedBy,
  });

  // Deduct from the Finished Goods Store (atomic, guarded against overselling).
  if (fields.packedQuantity > 0) {
    await storeService.applyStockOut({
      storeType: storeService.STORE.FINISHED_GOODS,
      customerId: payload.customerId,
      productId: payload.productId,
      quantity: fields.packedQuantity,
      sourceModule: 'dispatch',
      referenceId: record._id,
      remarks: `Dispatch ${String(payload.invoiceNumber).trim()}`,
      createdBy: submittedBy,
    });
  }

  // Attach uploads — record first, then media, then link (MediaAsset.ownerId needs
  // the record to exist). photos → 'image', documents → 'invoice'.
  const photoFiles = files && files.photos;
  const docFiles = files && files.documents;
  if ((photoFiles && photoFiles.length) || (docFiles && docFiles.length)) {
    const [photos, documents] = await Promise.all([
      attachMedia(photoFiles, { type: 'image', ownerId: record._id, uploadedBy: submittedBy }),
      attachMedia(docFiles, { type: 'invoice', ownerId: record._id, uploadedBy: submittedBy }),
    ]);
    record.photos = photos.map((m) => m._id);
    record.documents = documents.map((m) => m._id);
    await record.save();
    record.photos = photos; // populate for the response shape
    record.documents = documents;
  }

  const orderStatus = orderId ? await computeOrderStatus(orderId) : null;
  const finishedGoods = await storeService.getFinishedGoodsBalance(
    payload.customerId,
    payload.productId
  );
  return { record: toPublicDispatchRecord(record), orderStatus, finishedGoods };
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

// List the calling engineer's own dispatch records (GET /packing-dispatch/mine).
async function listMyRecords(submittedBy, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { ...buildFilter(query), submittedBy };

  const [items, total] = await Promise.all([
    PackingDispatchRecord.find(filter)
      .populate('photos').populate('documents')
      .sort({ createdAt: -1 }).skip(skip).limit(limit),
    PackingDispatchRecord.countDocuments(filter),
  ]);
  return buildList(items.map(toPublicDispatchRecord), total, page, limit);
}

// Admin read-all across customers/orders (GET /packing-dispatch), with filters.
async function listAllRecords(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildFilter(query);
  if (query.submittedBy && mongoose.Types.ObjectId.isValid(query.submittedBy)) {
    filter.submittedBy = query.submittedBy;
  }

  const [items, total] = await Promise.all([
    PackingDispatchRecord.find(filter)
      .populate('photos').populate('documents')
      .sort({ createdAt: -1 }).skip(skip).limit(limit),
    PackingDispatchRecord.countDocuments(filter),
  ]);
  return buildList(items.map(toPublicDispatchRecord), total, page, limit);
}

// Fetch one record. Admin may read any; a dispatch engineer may read only their own.
async function getRecordById(id, user) {
  const record = await PackingDispatchRecord.findById(id).populate('photos').populate('documents');
  if (!record) {
    throw notFound('Dispatch record not found', 'dispatch_record_not_found');
  }
  if (user.role !== ROLES.ADMIN && record.submittedBy.toString() !== String(user.id)) {
    throw forbidden('You can only access your own dispatch records');
  }
  return toPublicDispatchRecord(record);
}

module.exports = {
  createDispatchRecord,
  listMyRecords,
  listAllRecords,
  getRecordById,
  computeOrderStatus,
  toPublicDispatchRecord,
};
