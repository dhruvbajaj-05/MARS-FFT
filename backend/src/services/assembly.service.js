'use strict';

const mongoose = require('mongoose');
const AssemblyRecord = require('../models/AssemblyRecord');
const MediaAsset = require('../models/MediaAsset');
const Order = require('../models/Order');
const Product = require('../models/Product');
const ComponentStockItem = require('../models/ComponentStockItem');
const mouldingService = require('./moulding.service');
const storeService = require('./store.service');
const orderService = require('./order.service');
const outsourcedService = require('./outsourced.service');
const assortmentService = require('./assortment.service');
const reconcileService = require('./reconcile.service');
const { resolveShift } = require('../utils/shift');
const { ROLES } = require('../utils/roles');
const { badRequest, notFound, forbidden, conflict } = require('../utils/httpError');
const { parsePagination, buildList } = require('../utils/pagination');

const SHIFTS = ['A', 'B', 'C'];

// ---- Order-level assembly status (computed at read time; never stored).
// Assembly consumes Moulding output, so completion is measured against the good
// parts produced by Moulding for the order (the "input" available to assemble):
//   Pending     → no assembly records submitted yet
//   In Progress → records exist but assembled < moulding good output
//   Completed   → assembled >= moulding good output (and there is output to assemble)
function deriveStatus({ recordCount, totalAssembled }, mouldingOutput) {
  if (recordCount === 0) return 'Pending';
  if (mouldingOutput > 0 && totalAssembled >= mouldingOutput) return 'Completed';
  return 'In Progress';
}

// Aggregate assembly figures for one order.
async function aggregateAssembly(orderId) {
  const [agg] = await AssemblyRecord.aggregate([
    { $match: { orderId: new mongoose.Types.ObjectId(orderId) } },
    {
      $group: {
        _id: null,
        totalInput: { $sum: '$inputQuantity' },
        totalAssembled: { $sum: '$assembledQuantity' },
        totalRejected: { $sum: '$rejectedQuantity' },
        recordCount: { $sum: 1 },
      },
    },
  ]);
  return agg || { totalInput: 0, totalAssembled: 0, totalRejected: 0, recordCount: 0 };
}

// Compute the integrated assembly status for an order, pulling moulding output from
// the Moulding module so the two stages line up (Moulding output → Assembly input).
async function computeOrderStatus(orderId) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw badRequest('Invalid orderId', 'invalid_id');
  }
  const order = await Order.findById(orderId);
  if (!order) {
    throw notFound('Order not found', 'order_not_found');
  }

  const moulding = await mouldingService.computeOrderStatus(orderId);
  const mouldingOutput = moulding.goodParts; // usable parts available to assemble
  const sums = await aggregateAssembly(order._id);

  const status = deriveStatus(sums, mouldingOutput);
  const progressPct = mouldingOutput > 0
    ? Math.min(100, Math.round((sums.totalAssembled / mouldingOutput) * 100))
    : 0;

  return {
    orderId: order._id.toString(),
    customerId: order.customerId.toString(),
    productId: order.productId.toString(),
    orderQuantity: order.orderQuantity,
    mouldingOutput,
    assemblyInput: sums.totalInput,
    assembledQuantity: sums.totalAssembled,
    rejectedQuantity: sums.totalRejected,
    pendingQuantity: Math.max(0, mouldingOutput - sums.totalAssembled),
    progressPct,
    recordCount: sums.recordCount,
    status,
    // Nested moulding status so consumers (QC, admin) see the full chain.
    mouldingStatus: {
      orderQuantity: moulding.orderQuantity,
      goodParts: moulding.goodParts,
      status: moulding.status,
    },
  };
}

// Shape an assembly record for client responses. Handles `photos` whether populated
// MediaAsset docs or raw ObjectIds.
function toPublicAssemblyRecord(record) {
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
    assemblyLine: record.assemblyLine,
    operatorCount: record.operatorCount,
    shift: record.shift,
    inputQuantity: record.inputQuantity,
    assembledSets: record.assembledSets,
    extraSets: record.extraSets || 0,
    fromSurplus: !!record.fromSurplus,
    consumption: (record.consumption || []).map((c) => ({
      partName: c.partName,
      perSet: c.perSet,
      quantity: c.quantity,
      kind: c.kind || 'moulded',
    })),
    assembledQuantity: record.assembledQuantity,
    rejectedQuantity: record.rejectedQuantity,
    rejectionReason: record.rejectionReason || null,
    remarks: record.remarks || null,
    photos,
    submittedBy: record.submittedBy.toString(),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

// Validate + coerce numeric/enum fields, throwing clean 400s.
// Updated workflow: the engineer enters Assembled SETS; the system derives component
// consumption from the product assortment. assembledQuantity mirrors assembledSets.
function normalizeFields(input) {
  // Shift comes from the engineer's phone clock (see utils/shift.js); server time is a fallback.
  const numbers = { shift: resolveShift(input.shift) };
  for (const key of ['operatorCount', 'rejectedQuantity']) {
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < 0) {
      throw badRequest(`${key} must be a number >= 0`, 'invalid_quantity');
    }
    numbers[key] = value;
  }
  // assembledSets (normal, consumes the order) and extraSets (from surplus) are both
  // optional numbers >= 0; a record is one OR the other (see createAssemblyRecord).
  for (const key of ['assembledSets', 'extraSets']) {
    const has = input[key] !== undefined && input[key] !== null && input[key] !== '';
    const value = has ? Number(input[key]) : 0;
    if (has && (!Number.isFinite(value) || value < 0)) {
      throw badRequest(`${key} must be a number >= 0`, 'invalid_quantity');
    }
    numbers[key] = value;
  }
  // assembledQuantity (whole units) mirrors the normal sets the engineer assembled.
  numbers.assembledQuantity = numbers.assembledSets;

  // inputQuantity is optional; default 0 (= "not tracked").
  const hasInput = input.inputQuantity !== undefined && input.inputQuantity !== null && input.inputQuantity !== '';
  const inputQuantity = hasInput ? Number(input.inputQuantity) : 0;
  if (hasInput && (!Number.isFinite(inputQuantity) || inputQuantity < 0)) {
    throw badRequest('inputQuantity must be a number >= 0', 'invalid_quantity');
  }
  numbers.inputQuantity = inputQuantity;

  return numbers;
}

// Validate the Customer + Product + Order chain. Revised workflow: Assembly is
// order-scoped (the engineer selects Customer → Product → OrderID), so orderId is now
// REQUIRED and must be consistent with the customer/product. Returns the order document
// so the caller can check its assembly workspace status.
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

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw badRequest('orderId is required', 'invalid_id');
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

// Create an assembly record (assembly engineer only). Updated workflow: store-driven and
// CONSUMING — entering Assembled Sets deducts finished components from the Component Store
// according to the product's assortment (parts-per-set):
//   consumed(part) = assembledSets × perSet(part)
// All required deductions are pre-checked against on-hand stock so the submission either
// fully consumes or fails cleanly (no partial consumption under normal operation).
async function createAssemblyRecord({ payload, files, submittedBy }) {
  const order = await validateChain(payload);
  const fields = normalizeFields(payload);
  const orderId = payload.orderId;
  const { customerId, productId } = payload;

  if (order.status === 'Archived') {
    throw conflict('This order is archived.', 'order_archived');
  }
  if (order.assemblyStatus === 'Completed') {
    throw conflict('Assembly for this order is already completed.', 'assembly_completed');
  }

  // The engineer enters ONE number — Assembled Sets. The system splits it against the
  // order's remaining required sets: the first `normalSets` consume ORDER inventory
  // (finished moulded + allocated outsourced); any overflow `extraSets` consume the shared
  // PRODUCT surplus (moulded surplus + outsourced surplus). No separate extra-sets field.
  const totalSets = fields.assembledSets;
  const [doneAgg] = await AssemblyRecord.aggregate([
    { $match: { orderId: new mongoose.Types.ObjectId(orderId) } },
    { $group: { _id: null, totalSets: { $sum: '$assembledSets' } } },
  ]);
  const alreadyDone = doneAgg ? doneAgg.totalSets : 0;
  const remainingRequired = Math.max(0, (order.orderQuantity || 0) - alreadyDone);
  const normalSets = Math.min(totalSets, remainingRequired);
  const extraSets = totalSets - normalSets;

  // Resolve consumption sources — never mixed:
  //   moulded    → from the product's master Assortment (parts-per-set).
  //   outsourced → from THIS ORDER's BOM snapshot (perSet frozen at order creation), so
  //                changing the master BOM never retroactively changes an in-flight order.
  const assortmentParts = await assortmentService.getAssortmentParts(customerId, productId);
  const moulded = assortmentParts.filter((p) => (p.kind || 'moulded') === 'moulded');
  const outsourced = (await outsourcedService.getOrderBom({ customerId, productId, orderId }))
    .filter((p) => p.perSet > 0);
  if (totalSets > 0 && moulded.length === 0 && outsourced.length === 0) {
    throw badRequest(
      'No assortment/BOM defined for this product. Define parts-per-set before assembling sets.',
      'missing_assortment'
    );
  }

  // ---- ATOMIC PRE-VALIDATION: order portion AND surplus portion, before any deduction.
  // (Rule 6/10: no partial consumption, no inventory loss.) Gather every shortage first.
  const shortages = [];
  if (normalSets > 0) {
    const availability = await storeService.getComponentAvailability(customerId, productId, { orderId });
    const mOnHand = new Map(availability.parts.map((p) => [p.partName, p.quantityOnHand]));
    const oOnHand = await outsourcedService.getOrderQuantities({ customerId, productId, orderId });
    for (const p of moulded) {
      const need = p.perSet * normalSets;
      if (need > 0 && (mOnHand.get(p.partName) || 0) < need) shortages.push(`${p.partName} order (need ${need}, have ${mOnHand.get(p.partName) || 0})`);
    }
    for (const p of outsourced) {
      const need = p.perSet * normalSets;
      if (need > 0 && (oOnHand.get(p.partName) || 0) < need) shortages.push(`${p.partName} outsourced (need ${need}, have ${oOnHand.get(p.partName) || 0})`);
    }
  }
  if (extraSets > 0) {
    const mList = (await storeService.getSurplusByProduct({ customerId, productId })).get(`${customerId}|${productId}`) || [];
    const mSurplus = new Map(mList.map((p) => [p.partName, p.quantityOnHand]));
    const oSurplus = await outsourcedService.getSurplusQuantities({ customerId, productId });
    for (const p of moulded) {
      const need = p.perSet * extraSets;
      if (need > 0 && (mSurplus.get(p.partName) || 0) < need) shortages.push(`${p.partName} surplus (need ${need}, have ${mSurplus.get(p.partName) || 0})`);
    }
    for (const p of outsourced) {
      const need = p.perSet * extraSets;
      if (need > 0 && (oSurplus.get(p.partName) || 0) < need) shortages.push(`${p.partName} outsourced surplus (need ${need}, have ${oSurplus.get(p.partName) || 0})`);
    }
  }
  if (shortages.length > 0) {
    throw conflict(`Insufficient stock to assemble ${totalSets} set(s): ${shortages.join(', ')}`, 'insufficient_stock');
  }

  // Snapshot total consumption per part for the record — this is the SOURCE OF TRUTH that
  // reconcile reads to derive Component/Outsourced store balances (normal sets → order
  // bucket, extra sets → product surplus). moulded uses master perSet, outsourced the
  // order snapshot perSet.
  const consumption = [
    ...moulded.map((p) => ({ partName: p.partName, perSet: p.perSet, quantity: p.perSet * totalSets, kind: 'moulded' })),
    ...outsourced.map((p) => ({ partName: p.partName, perSet: p.perSet, quantity: p.perSet * totalSets, kind: 'outsourced' })),
  ].filter((c) => c.quantity > 0);

  const record = await AssemblyRecord.create({
    orderId,
    customerId,
    productId,
    assemblyLine: String(payload.assemblyLine).trim(),
    operatorCount: fields.operatorCount,
    shift: fields.shift,
    inputQuantity: fields.inputQuantity,
    assembledSets: normalSets,
    extraSets,
    fromSurplus: extraSets > 0,
    consumption,
    assembledQuantity: normalSets,
    rejectedQuantity: fields.rejectedQuantity,
    rejectionReason: payload.rejectionReason ? String(payload.rejectionReason).trim() : undefined,
    remarks: payload.remarks ? String(payload.remarks).trim() : undefined,
    submittedBy,
  });

  // ---- ORDER COMPLETION: when cumulative normal sets reach the order's required sets, mark
  // assembly complete FIRST so reconcile rolls the order's remaining components into product
  // surplus (completed orders release their on-hand). History preserved.
  let completion = null;
  if (order.orderQuantity > 0 && alreadyDone + normalSets >= order.orderQuantity) {
    await orderService.completeAssembly(orderId);
    completion = { completed: true };
  }

  // Consumption is now recorded on the AssemblyRecord; recompute the whole product's stores
  // from history (order buckets, product surplus, outsourced) — no incremental deductions.
  await reconcileService.reconcileProduct(customerId, productId);
  await reconcileService.reconcileOutsourced(customerId, productId);

  // Attach uploaded photos (if any). MediaAsset.ownerId needs the record to exist
  // first, so we create the record, then the media, then link — within this request.
  if (files && files.length > 0) {
    const { publicUrlFor } = require('../middleware/upload');
    const media = await MediaAsset.insertMany(
      files.map((f) => ({
        type: 'image',
        url: publicUrlFor(f.path),
        mimeType: f.mimetype,
        sizeBytes: f.size,
        ownerType: 'assembly',
        ownerId: record._id,
        uploadedBy: submittedBy,
      }))
    );
    record.photos = media.map((m) => m._id);
    await record.save();
    record.photos = media; // populate for the response shape
  }

  // Context for the client: order-level status + the order's remaining finished
  // components after this consumption.
  const orderStatus = await computeOrderStatus(orderId);
  const availability = await getComponentAvailability(payload.customerId, payload.productId, orderId);
  return { record: toPublicAssemblyRecord(record), orderStatus, componentAvailability: availability, completion };
}

// Component availability for a Customer + Product + Order (drives the Assembly screen).
// Assembly consumes from the order's ACTUAL on-hand finished-component balance, so we
// report every part that still has stock on hand (positiveOnly) — NOT only the rows whose
// derived status is "finished". Gating on status:'finished' was the stock bug: once the
// first submission drops a part's balance below its Required Quantity the row flips to
// "pending" and would vanish from this list, making later submissions wrongly report
// "not enough stock" while real inventory remained. The balance now updates correctly
// after every submission and is never reset.
async function getComponentAvailability(customerId, productId, orderId) {
  return storeService.getComponentAvailability(customerId, productId, {
    orderId,
    positiveOnly: true,
  });
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

// List assembly records for the whole department — every assembly engineer sees all
// records, not just their own (shared visibility, req #8). Optional customer/product/order
// filters still apply.
async function listMyRecords(_submittedBy, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildFilter(query);

  const [items, total] = await Promise.all([
    AssemblyRecord.find(filter).populate('photos').sort({ createdAt: -1 }).skip(skip).limit(limit),
    AssemblyRecord.countDocuments(filter),
  ]);
  return buildList(items.map(toPublicAssemblyRecord), total, page, limit);
}

// Admin read-all across customers/orders (GET /assembly), with optional filters.
async function listAllRecords(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildFilter(query);
  if (query.submittedBy && mongoose.Types.ObjectId.isValid(query.submittedBy)) {
    filter.submittedBy = query.submittedBy;
  }

  const [items, total] = await Promise.all([
    AssemblyRecord.find(filter).populate('photos').sort({ createdAt: -1 }).skip(skip).limit(limit),
    AssemblyRecord.countDocuments(filter),
  ]);
  return buildList(items.map(toPublicAssemblyRecord), total, page, limit);
}

// Fetch one record. Admin and any assembly engineer may read any record (shared dept
// visibility, req #8). The route guard already restricts this to admin + assembly roles.
async function getRecordById(id, user) {
  const record = await AssemblyRecord.findById(id).populate('photos');
  if (!record) {
    throw notFound('Assembly record not found', 'assembly_record_not_found');
  }
  if (user.role !== ROLES.ADMIN && user.role !== ROLES.ASSEMBLY_ENGINEER) {
    throw forbidden('Access denied');
  }
  return toPublicAssemblyRecord(record);
}

module.exports = {
  createAssemblyRecord,
  getComponentAvailability,
  listMyRecords,
  listAllRecords,
  getRecordById,
  computeOrderStatus,
  toPublicAssemblyRecord,
};
