'use strict';

const mongoose = require('mongoose');
const MouldingRecord = require('../models/MouldingRecord');
const MediaAsset = require('../models/MediaAsset');
const Order = require('../models/Order');
const moldService = require('./mold.service');
const orderMoldService = require('./orderMold.service');
const storeService = require('./store.service');
const rejectionReasonService = require('./rejectionReason.service');
const { currentShift } = require('../utils/shift');
const { ROLES } = require('../utils/roles');
const { badRequest, notFound, forbidden, conflict } = require('../utils/httpError');
const { parsePagination, buildList } = require('../utils/pagination');

const SHIFTS = ['A', 'B', 'C'];

// ---- Order-level production status (computed at read time; never stored — V1 is
// insert-only/immutable). Fulfillment is measured by GOOD parts, since rejected
// parts cannot ship against the order quantity.
//   Pending     → no moulding records submitted for the order yet
//   In Progress → records exist but good parts < order quantity
//   Completed   → good parts >= order quantity
function deriveStatus({ recordCount, totalGoodParts }, orderQuantity) {
  if (recordCount === 0) return 'Pending';
  if (totalGoodParts >= orderQuantity) return 'Completed';
  return 'In Progress';
}

// Aggregate moulding production for one order and return its computed status.
async function computeOrderStatus(orderId) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw badRequest('Invalid orderId', 'invalid_id');
  }
  const order = await Order.findById(orderId);
  if (!order) {
    throw notFound('Order not found', 'order_not_found');
  }

  const [agg] = await MouldingRecord.aggregate([
    { $match: { orderId: order._id } },
    {
      $group: {
        _id: null,
        totalProduced: { $sum: '$productionQuantity' },
        totalGoodParts: { $sum: '$goodParts' },
        totalRejected: { $sum: '$rejectedParts' },
        recordCount: { $sum: 1 },
      },
    },
  ]);

  const sums = agg || { totalProduced: 0, totalGoodParts: 0, totalRejected: 0, recordCount: 0 };
  const orderQuantity = order.orderQuantity;
  const status = deriveStatus(sums, orderQuantity);
  const progressPct = orderQuantity > 0
    ? Math.min(100, Math.round((sums.totalGoodParts / orderQuantity) * 100))
    : (sums.recordCount > 0 ? 100 : 0);

  return {
    orderId: order._id.toString(),
    customerId: order.customerId.toString(),
    productId: order.productId.toString(),
    orderQuantity,
    producedQuantity: sums.totalProduced,
    goodParts: sums.totalGoodParts,
    rejectedParts: sums.totalRejected,
    pendingQuantity: Math.max(0, orderQuantity - sums.totalGoodParts),
    progressPct,
    recordCount: sums.recordCount,
    status,
  };
}

// Shape a moulding record for client responses. Handles `imageId` whether it is a
// raw ObjectId or a populated MediaAsset document.
function toPublicMouldingRecord(record) {
  const media = record.imageId && record.imageId.url ? record.imageId : null;
  return {
    id: record._id.toString(),
    orderId: record.orderId.toString(),
    productId: record.productId.toString(),
    customerId: record.customerId.toString(),
    moldName: record.moldName,
    partName: record.partName,
    machineNumber: record.machineNumber,
    shift: record.shift,
    cavity: record.cavity,
    shotsDone: record.shotsDone,
    productionQuantity: record.productionQuantity,
    goodParts: record.goodParts,
    rejectedParts: record.rejectedParts,
    rejectionReason: record.rejectionReason || null,
    comments: record.comments || null,
    imageId: record.imageId ? (record.imageId._id || record.imageId).toString() : null,
    image: media
      ? { id: media._id.toString(), url: media.url, type: media.type, mimeType: media.mimeType, sizeBytes: media.sizeBytes }
      : null,
    createdBy: record.createdBy.toString(),
    createdAt: record.createdAt,
  };
}

// Validate + coerce the numeric/enum department fields, throwing clean 400s.
// Updated workflow: the engineer enters Shots Done + Rejected Pieces; cavity is resolved
// from the mold. The system computes the totals — never trusts client-sent good/total:
//   productionQuantity = shotsDone × cavity
//   goodParts          = productionQuantity − rejectedParts   (must be >= 0)
function normalizeFields(input, cavity) {
  // Shift is auto-detected from server time (manual selection removed).
  const shift = currentShift();

  const cav = Number(cavity);
  if (!Number.isFinite(cav) || cav < 1) {
    throw badRequest('cavity must be a number >= 1', 'invalid_cavity');
  }

  const shotsDone = Number(input.shotsDone);
  if (!Number.isFinite(shotsDone) || shotsDone < 0) {
    throw badRequest('shotsDone must be a number >= 0', 'invalid_quantity');
  }

  const rejectedParts = Number(input.rejectedParts);
  if (!Number.isFinite(rejectedParts) || rejectedParts < 0) {
    throw badRequest('rejectedParts must be a number >= 0', 'invalid_quantity');
  }

  const productionQuantity = shotsDone * cav;
  const goodParts = productionQuantity - rejectedParts;
  if (goodParts < 0) {
    throw badRequest(
      'rejectedParts cannot exceed produced pieces (shotsDone × cavity)',
      'inconsistent_quantities'
    );
  }

  return { shift, cavity: cav, shotsDone, productionQuantity, goodParts, rejectedParts };
}

// Validate the customer → product → order chain so a record can never be linked to
// an inconsistent selection (the dropdowns are cascading, but never trust the client).
async function validateChain({ orderId, productId, customerId }) {
  for (const [key, value] of Object.entries({ orderId, productId, customerId })) {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw badRequest(`Invalid ${key}`, 'invalid_id');
    }
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
  return order;
}

// Create a moulding record (moulding engineer only). If `file` is present it is
// linked as the record's image via a `mediaassets` document.
async function createMouldingRecord({ payload, file, createdBy }) {
  const order = await validateChain(payload);

  // A push can only land on an Active production workspace. Once Admin completes
  // production the order's records become history and the workspace is closed.
  if (order.productionStatus === 'Completed' || order.status === 'Archived') {
    throw conflict(
      'Production for this order is already completed — the moulding workspace is closed.',
      'production_completed'
    );
  }

  const moldName = String(payload.moldName).trim();

  // Resolve cavity + Required Shots server-authoritatively. Precedence:
  //   1. the per-order Mould Setup (OrderMold) — the order's concrete target
  //   2. the product-level learned MoldDefinition — suggestion memory
  //   3. the cavity/requiredShots sent with the form — first-ever submission fallback
  const orderMold = await orderMoldService.findOrderMold(payload.orderId, moldName);
  const mold = orderMold ? null : await moldService.findMold(payload.productId, moldName);
  const source = orderMold || mold;
  const cavity = source ? source.cavity : payload.cavity;
  // Part name comes from the order/learned mold; an explicit override is allowed.
  const partName = String(
    payload.partName || (orderMold && orderMold.partName) || (mold && mold.defaultPartName) || ''
  ).trim();
  if (!partName) {
    throw badRequest('partName is required', 'missing_part');
  }

  const fields = normalizeFields(payload, cavity);

  // Required Quantity target for this mold-part in the order's store cell
  // (= requiredShots × cavity).
  const requiredShots = source ? source.requiredShots : Number(payload.requiredShots) || 0;
  const requiredQuantity = (requiredShots || 0) * fields.cavity;

  const record = await MouldingRecord.create({
    orderId: payload.orderId,
    productId: payload.productId,
    customerId: payload.customerId,
    moldName,
    partName,
    machineNumber: String(payload.machineNumber).trim(),
    shift: fields.shift,
    cavity: fields.cavity,
    shotsDone: fields.shotsDone,
    productionQuantity: fields.productionQuantity,
    goodParts: fields.goodParts,
    rejectedParts: fields.rejectedParts,
    rejectionReason: payload.rejectionReason ? String(payload.rejectionReason).trim() : undefined,
    comments: payload.comments ? String(payload.comments).trim() : undefined,
    createdBy,
  });

  // Remember a newly typed rejection reason so future dropdowns suggest it.
  if (payload.rejectionReason && String(payload.rejectionReason).trim()) {
    await rejectionReasonService.rememberReason(String(payload.rejectionReason).trim(), createdBy);
  }

  // Mold Learning: remember this Product → Mold → Part → Cavity relationship so future
  // orders surface the mold in the dropdown and auto-fill part + cavity. cavity/
  // requiredShots are seeded on first sight; explicit edits go through upsertMold.
  await moldService.learnMold({
    customerId: payload.customerId,
    productId: payload.productId,
    moldName,
    partName,
    cavity: fields.cavity,
    requiredShots,
    createdBy,
  });

  // Component Store: only GOOD pieces flow into central inventory (Customer → Product →
  // Part). Rejected pieces are not usable downstream. Multiple shifts/orders for the same
  // mold-part accumulate into the same cell; the Required Quantity target rides along so
  // the store can mark the row Pending → Finished.
  if (fields.goodParts > 0) {
    await storeService.applyStockIn({
      storeType: storeService.STORE.COMPONENT,
      customerId: payload.customerId,
      productId: payload.productId,
      orderId: payload.orderId,
      partName,
      moldName,
      cavity: fields.cavity,
      requiredQuantity,
      quantity: fields.goodParts,
      sourceModule: 'moulding',
      referenceId: record._id,
      remarks: `Moulding ${moldName} / ${partName}`,
      createdBy,
    });
  }

  // Attach the uploaded image (if any). MediaAsset.ownerId requires the record to
  // exist first, so we create the record, then the media, then link it — all within
  // this single create request (not an "edit" of an existing record).
  if (file) {
    const { publicUrlFor } = require('../middleware/upload');
    const media = await MediaAsset.create({
      type: 'image',
      url: publicUrlFor(file.path),
      mimeType: file.mimetype,
      sizeBytes: file.size,
      ownerType: 'moulding',
      ownerId: record._id,
      uploadedBy: createdBy,
    });
    record.imageId = media._id;
    await record.save();
    record.imageId = media; // populate for the response shape
  }

  const orderStatus = await computeOrderStatus(payload.orderId);
  return { record: toPublicMouldingRecord(record), orderStatus };
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

// List the calling engineer's own moulding records (GET /moulding/mine).
async function listMyRecords(createdBy, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { ...buildFilter(query), createdBy };

  const [items, total] = await Promise.all([
    MouldingRecord.find(filter).populate('imageId').sort({ createdAt: -1 }).skip(skip).limit(limit),
    MouldingRecord.countDocuments(filter),
  ]);

  return buildList(items.map(toPublicMouldingRecord), total, page, limit);
}

// Admin read-all across customers/orders (GET /moulding), with optional filters.
async function listAllRecords(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildFilter(query);
  if (query.createdBy && mongoose.Types.ObjectId.isValid(query.createdBy)) {
    filter.createdBy = query.createdBy;
  }

  const [items, total] = await Promise.all([
    MouldingRecord.find(filter).populate('imageId').sort({ createdAt: -1 }).skip(skip).limit(limit),
    MouldingRecord.countDocuments(filter),
  ]);

  return buildList(items.map(toPublicMouldingRecord), total, page, limit);
}

// Fetch one record. Admin may read any; a moulding engineer may read only their own.
async function getRecordById(id, user) {
  const record = await MouldingRecord.findById(id).populate('imageId');
  if (!record) {
    throw notFound('Moulding record not found', 'moulding_record_not_found');
  }
  if (user.role !== ROLES.ADMIN && record.createdBy.toString() !== String(user.id)) {
    throw forbidden('You can only access your own moulding records');
  }
  return toPublicMouldingRecord(record);
}

// Learned molds for a product (Mold Learning dropdown + part autofill). Delegates to
// the mold service so the controller keeps using a single department service.
async function listMoldsForProduct(productId) {
  return moldService.listMoldsForProduct(productId);
}

// Explicitly define/edit a mold for a product (Mold Name, Part, Cavity, Required Shots).
async function upsertMold(payload, createdBy) {
  return moldService.upsertMold({ ...payload, createdBy });
}

// Per-order Mould Setup (revised workflow) — delegates to the order-mold service so the
// controller keeps using a single department service.
async function listOrderMolds(orderId) {
  return orderMoldService.listForOrder(orderId);
}

async function upsertOrderMold(payload, createdBy) {
  return orderMoldService.upsertOrderMold({ ...payload, createdBy });
}

module.exports = {
  createMouldingRecord,
  listMyRecords,
  listAllRecords,
  getRecordById,
  computeOrderStatus,
  listMoldsForProduct,
  upsertMold,
  listOrderMolds,
  upsertOrderMold,
  listRejectionReasons: rejectionReasonService.listReasons,
  toPublicMouldingRecord,
};
