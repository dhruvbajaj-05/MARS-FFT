'use strict';

const mongoose = require('mongoose');
const MouldingRecord = require('../models/MouldingRecord');
const MediaAsset = require('../models/MediaAsset');
const Order = require('../models/Order');
const PurchaseOrder = require('../models/PurchaseOrder');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const moldService = require('./mold.service');
const orderMoldService = require('./orderMold.service');
const OrderMold = require('../models/OrderMold');
const storeService = require('./store.service');
const reconcileService = require('./reconcile.service');
const rejectionReasonService = require('./rejectionReason.service');
const { resolveShift } = require('../utils/shift');
const { ROLES } = require('../utils/roles');
const { badRequest, notFound, forbidden, conflict } = require('../utils/httpError');
const { parsePagination, buildList } = require('../utils/pagination');

// Engineer may edit/delete within 12 hours of record creation.
const EDIT_WINDOW_MS = 12 * 60 * 60 * 1000;

// ---- Order-level production status (computed at read time).
// Fulfillment is measured by GOOD parts; rejected parts cannot ship.
function deriveStatus({ recordCount, totalGoodParts }, targetPieces) {
  if (recordCount === 0) return 'Pending';
  if (totalGoodParts >= targetPieces) return 'Completed';
  return 'In Progress';
}

// Sum of (requiredShots × cavity) across all molds set up for an order.
// This is the true piece target for moulding — distinct from order.orderQuantity which is
// in customer-facing sets/units, not moulded pieces.
async function computeTargetPieces(orderId) {
  const [agg] = await OrderMold.aggregate([
    { $match: { orderId: new mongoose.Types.ObjectId(String(orderId)) } },
    { $group: { _id: null, total: { $sum: { $multiply: ['$requiredShots', '$cavity'] } } } },
  ]);
  return agg?.total ?? 0;
}

// Recompute the (order, mould) enforcement counter from the record history and persist it.
// Keeps OrderMold.completedShots exact after edits/deletes (self-healing — never drifts).
async function recomputeCompletedShots(orderId, moldName) {
  const [agg] = await MouldingRecord.aggregate([
    { $match: { orderId: new mongoose.Types.ObjectId(String(orderId)), moldName } },
    { $group: { _id: null, total: { $sum: '$shotsDone' } } },
  ]);
  const total = agg?.total ?? 0;
  await OrderMold.updateOne({ orderId, moldName }, { $set: { completedShots: total } });
  return total;
}

async function computeOrderStatus(orderId) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw badRequest('Invalid orderId', 'invalid_id');
  }
  const order = await Order.findById(orderId);
  if (!order) {
    throw notFound('Order not found', 'order_not_found');
  }

  // Single per-mold aggregation — overall totals are derived from it (one DB hit).
  const [moldProdArr, orderMolds] = await Promise.all([
    MouldingRecord.aggregate([
      { $match: { orderId: order._id } },
      {
        $group: {
          _id: '$moldName',
          shotsDone: { $sum: '$shotsDone' },
          goodParts: { $sum: '$goodParts' },
          productionQuantity: { $sum: '$productionQuantity' },
          recordCount: { $sum: 1 },
        },
      },
    ]),
    OrderMold.find({ orderId: order._id }).lean(),
  ]);

  // Overall totals computed from per-mold data.
  const totalGoodParts = moldProdArr.reduce((s, m) => s + m.goodParts, 0);
  const totalProduced = moldProdArr.reduce((s, m) => s + m.productionQuantity, 0);
  const totalRecords = moldProdArr.reduce((s, m) => s + m.recordCount, 0);

  // Index production by moldName for O(1) lookup.
  const prodByMold = Object.fromEntries(moldProdArr.map((m) => [m._id, m]));

  // Per-mold progress — each OrderMold is the authoritative source for targets.
  const moldProgress = orderMolds.map((m) => {
    const prod = prodByMold[m.moldName] || { shotsDone: 0, goodParts: 0 };
    const requiredPieces = (m.requiredShots || 0) * m.cavity;
    return {
      moldName: m.moldName,
      partName: m.partName,
      cavity: m.cavity,
      requiredShots: m.requiredShots || 0,
      requiredPieces,
      shotsDone: prod.shotsDone || 0,
      goodParts: prod.goodParts || 0,
      isComplete: requiredPieces > 0 && (prod.goodParts || 0) >= requiredPieces,
    };
  });

  // Overall status: ALL molds with a piece target must be complete.
  const moldsWithTargets = moldProgress.filter((m) => m.requiredPieces > 0);
  const totalTargetPieces = moldsWithTargets.reduce((s, m) => s + m.requiredPieces, 0);

  let status;
  if (totalRecords === 0) {
    status = 'Pending';
  } else if (moldsWithTargets.length > 0 && moldsWithTargets.every((m) => m.isComplete)) {
    status = 'Completed';
  } else if (moldsWithTargets.length === 0) {
    // No mold targets configured — fall back to aggregate comparison against order qty.
    status = deriveStatus({ recordCount: totalRecords, totalGoodParts }, order.orderQuantity);
  } else {
    status = 'In Progress';
  }

  const orderQuantity = totalTargetPieces > 0 ? totalTargetPieces : order.orderQuantity;
  const progressPct = orderQuantity > 0
    ? Math.min(100, Math.round((totalGoodParts / orderQuantity) * 100))
    : (totalRecords > 0 ? 100 : 0);

  return {
    orderId: order._id.toString(),
    customerId: order.customerId.toString(),
    productId: order.productId.toString(),
    orderQuantity,
    producedQuantity: totalProduced,
    goodParts: totalGoodParts,
    pendingQuantity: Math.max(0, orderQuantity - totalGoodParts),
    progressPct,
    recordCount: totalRecords,
    status,
    moldProgress,
  };
}

// Auto-complete the moulding workspace when all good parts reach the order quantity.
// This replaces the admin "Complete Production" button (req #13).
async function autoCompleteOrderIfDone(order, orderStatus) {
  if (orderStatus.status === 'Completed' && order.productionStatus === 'Active') {
    order.productionStatus = 'Completed';
    order.productionCompletedAt = new Date();
    if (order.assemblyStatus === 'Completed') {
      order.status = 'Completed';
      order.completedAt = new Date();
    }
    await order.save();
  }
}

// Shape a moulding record for client responses.
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
    rejectedShots: record.rejectedShots ?? 0,
    productionQuantity: record.productionQuantity,
    goodParts: record.goodParts,
    rejectionReasons: record.rejectionReasons || [],
    rejectionReason: record.rejectionReason || null,
    comments: record.comments || null,
    imageId: record.imageId ? (record.imageId._id || record.imageId).toString() : null,
    image: media
      ? { id: media._id.toString(), url: media.url, type: media.type, mimeType: media.mimeType, sizeBytes: media.sizeBytes }
      : null,
    createdBy: record.createdBy.toString(),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    canEdit: (Date.now() - new Date(record.createdAt).getTime()) < EDIT_WINDOW_MS,
  };
}

// Validate + coerce numeric/enum fields.
// Formula: goodParts = (shotsDone − rejectedShots) × cavity.
function normalizeFields(input, cavity) {
  // Shift comes from the engineer's phone clock (see utils/shift.js); server time is a fallback.
  const shift = resolveShift(input.shift);

  const cav = Number(cavity);
  if (!Number.isFinite(cav) || cav < 1) {
    throw badRequest('cavity must be a number >= 1', 'invalid_cavity');
  }

  const shotsDone = Number(input.shotsDone);
  if (!Number.isFinite(shotsDone) || shotsDone < 0) {
    throw badRequest('shotsDone must be a number >= 0', 'invalid_quantity');
  }

  const rejectedShots = (input.rejectedShots !== undefined && input.rejectedShots !== null && input.rejectedShots !== '')
    ? Number(input.rejectedShots)
    : 0;

  if (!Number.isFinite(rejectedShots) || rejectedShots < 0) {
    throw badRequest('rejectedShots must be a number >= 0', 'invalid_quantity');
  }
  if (rejectedShots > shotsDone) {
    throw badRequest('rejectedShots cannot exceed shotsDone', 'inconsistent_quantities');
  }

  const productionQuantity = shotsDone * cav;
  const goodParts = (shotsDone - rejectedShots) * cav;
  return { shift, cavity: cav, shotsDone, rejectedShots, productionQuantity, goodParts };
}

async function validateChain({ orderId, productId, customerId }) {
  for (const [key, value] of Object.entries({ orderId, productId, customerId })) {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw badRequest(`Invalid ${key}`, 'invalid_id');
    }
  }
  const order = await Order.findById(orderId);
  if (!order) throw badRequest('orderId does not reference an existing order', 'invalid_order');
  if (order.productId.toString() !== String(productId)) {
    throw badRequest('productId does not match the order', 'product_order_mismatch');
  }
  if (order.customerId.toString() !== String(customerId)) {
    throw badRequest('customerId does not match the order', 'customer_order_mismatch');
  }
  return order;
}

async function createMouldingRecord({ payload, file, createdBy }) {
  const order = await validateChain(payload);

  if (order.status === 'Archived') {
    throw conflict(
      'Production for this order is already completed — the moulding workspace is closed.',
      'production_completed'
    );
  }

  if (order.productionStatus === 'Completed') {
    // Self-heal: if the order was auto-completed incorrectly (goodParts vs order sets mismatch),
    // reset it so the engineer can continue pushing production.
    const targetPieces = await computeTargetPieces(order._id);
    if (targetPieces > 0) {
      const [existingAgg] = await MouldingRecord.aggregate([
        { $match: { orderId: order._id } },
        { $group: { _id: null, total: { $sum: '$goodParts' } } },
      ]);
      const currentGoodParts = existingAgg?.total ?? 0;
      if (currentGoodParts < targetPieces) {
        order.productionStatus = 'Active';
        order.productionCompletedAt = null;
        await order.save();
      } else {
        throw conflict(
          'Production for this order is already completed — the moulding workspace is closed.',
          'production_completed'
        );
      }
    } else {
      throw conflict(
        'Production for this order is already completed — the moulding workspace is closed.',
        'production_completed'
      );
    }
  }

  const moldName = String(payload.moldName).trim();

  const orderMold = await orderMoldService.findOrderMold(payload.orderId, moldName);
  const mold = orderMold ? null : await moldService.findMold(payload.productId, moldName);
  const source = orderMold || mold;
  const cavity = source ? source.cavity : payload.cavity;
  const partName = String(
    payload.partName || (orderMold && orderMold.partName) || (mold && mold.defaultPartName) || ''
  ).trim();
  if (!partName) throw badRequest('partName is required', 'missing_part');

  const fields = normalizeFields(payload, cavity);

  const requiredShots = source ? source.requiredShots : Number(payload.requiredShots) || 0;

  // ---- Per-(order, mould) target enforcement (concurrency-safe) ----------------
  // When this mould has a configured target on THIS order (OrderMold.requiredShots > 0),
  // atomically reserve the shots against `completedShots` with a guard so two engineers
  // submitting near the target at the same time can never push it over. If the guard fails,
  // tell the engineer exactly how many shots remain. Records stay the source of truth; this
  // counter is recomputed on edit/delete.
  let reservedOnMold = null;
  if (orderMold && orderMold.requiredShots > 0) {
    const guarded = await OrderMold.findOneAndUpdate(
      {
        _id: orderMold._id,
        $expr: {
          $lte: [{ $add: [{ $ifNull: ['$completedShots', 0] }, fields.shotsDone] }, '$requiredShots'],
        },
      },
      { $inc: { completedShots: fields.shotsDone } },
      { new: true }
    );
    if (!guarded) {
      const remaining = Math.max(0, orderMold.requiredShots - (orderMold.completedShots || 0));
      throw conflict(
        `Only ${remaining} shot${remaining === 1 ? '' : 's'} remain for mould ${moldName} on this item code (target ${orderMold.requiredShots}). You tried to push ${fields.shotsDone}.`,
        'target_exceeded'
      );
    }
    reservedOnMold = orderMold._id;
  }

  // rejectionReasons: accept array (new) or single string (legacy).
  const rejectionReasons = Array.isArray(payload.rejectionReasons)
    ? payload.rejectionReasons.map((r) => String(r).trim()).filter(Boolean)
    : payload.rejectionReason
      ? [String(payload.rejectionReason).trim()]
      : [];

  let record;
  try {
    record = await MouldingRecord.create({
      orderId: payload.orderId,
      productId: payload.productId,
      customerId: payload.customerId,
      moldName,
      partName,
      machineNumber: String(payload.machineNumber).trim(),
      shift: fields.shift,
      cavity: fields.cavity,
      shotsDone: fields.shotsDone,
      rejectedShots: fields.rejectedShots,
      productionQuantity: fields.productionQuantity,
      goodParts: fields.goodParts,
      rejectionReasons,
      rejectionReason: null,
      comments: payload.comments ? String(payload.comments).trim() : undefined,
      createdBy,
    });
  } catch (err) {
    // Release the reserved shots if the record couldn't be written, so the guard counter
    // never drifts above the real record total.
    if (reservedOnMold) {
      await OrderMold.updateOne({ _id: reservedOnMold }, { $inc: { completedShots: -fields.shotsDone } }).catch(() => {});
    }
    throw err;
  }

  // Remember any new rejection reasons for the multi-select list.
  if (rejectionReasons.length > 0) {
    await rejectionReasonService.rememberReason(rejectionReasons, createdBy);
  }

  await moldService.learnMold({
    customerId: payload.customerId,
    productId: payload.productId,
    moldName,
    partName,
    cavity: fields.cavity,
    requiredShots,
    createdBy,
  });

  // Recompute the whole product's component/surplus balances from the record history.
  // (No incremental $inc — reconcile owns every balance, so create/edit/delete stay exact.)
  await reconcileService.reconcileProduct(payload.customerId, payload.productId);

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
    record.imageId = media;
  }

  const orderStatus = await computeOrderStatus(payload.orderId);

  // Auto-complete moulding workspace when order quantity is fully produced (req #13).
  await autoCompleteOrderIfDone(order, orderStatus);

  return { record: toPublicMouldingRecord(record), orderStatus };
}

// Edit a moulding record within the 12-hour window. Stock is recalculated if shot
// counts change; a ledger correction entry is written for any delta.
async function updateMouldingRecord(id, payload, user) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid id', 'invalid_id');
  const record = await MouldingRecord.findById(id);
  if (!record) throw notFound('Moulding record not found', 'moulding_record_not_found');

  if (record.createdBy.toString() !== String(user.id)) {
    throw forbidden('You can only edit your own moulding records');
  }
  const ageMs = Date.now() - new Date(record.createdAt).getTime();
  if (ageMs > EDIT_WINDOW_MS) {
    throw forbidden('Edit window has expired (12 hours after creation)', 'edit_window_expired');
  }

  // Update shot counts when provided.
  if (payload.shotsDone !== undefined || payload.rejectedShots !== undefined) {
    const newShotsDone = payload.shotsDone !== undefined ? Number(payload.shotsDone) : record.shotsDone;
    const newRejectedShots = payload.rejectedShots !== undefined ? Number(payload.rejectedShots) : (record.rejectedShots ?? 0);
    if (!Number.isFinite(newShotsDone) || newShotsDone < 0) throw badRequest('shotsDone must be >= 0', 'invalid_quantity');
    if (!Number.isFinite(newRejectedShots) || newRejectedShots < 0) throw badRequest('rejectedShots must be >= 0', 'invalid_quantity');
    if (newRejectedShots > newShotsDone) throw badRequest('rejectedShots cannot exceed shotsDone', 'inconsistent_quantities');

    // Enforce the (order, mould) target on edit too: other records' shots + this edit must
    // not exceed the configured requiredShots.
    const om = await OrderMold.findOne({ orderId: record.orderId, moldName: record.moldName });
    if (om && om.requiredShots > 0) {
      const [agg] = await MouldingRecord.aggregate([
        { $match: { orderId: record.orderId, moldName: record.moldName, _id: { $ne: record._id } } },
        { $group: { _id: null, total: { $sum: '$shotsDone' } } },
      ]);
      const others = agg?.total ?? 0;
      if (others + newShotsDone > om.requiredShots) {
        const remaining = Math.max(0, om.requiredShots - others);
        throw conflict(
          `Edit exceeds target: mould ${record.moldName} allows ${remaining} more shot${remaining === 1 ? '' : 's'} on this item code (target ${om.requiredShots}).`,
          'target_exceeded'
        );
      }
    }

    record.shotsDone = newShotsDone;
    record.rejectedShots = newRejectedShots;
    record.productionQuantity = newShotsDone * record.cavity;
    record.goodParts = (newShotsDone - newRejectedShots) * record.cavity;
  }

  if (payload.rejectionReasons !== undefined) {
    const reasons = Array.isArray(payload.rejectionReasons)
      ? payload.rejectionReasons.map((r) => String(r).trim()).filter(Boolean)
      : [];
    record.rejectionReasons = reasons;
    if (reasons.length > 0) await rejectionReasonService.rememberReason(reasons, user.id);
  }
  if (payload.comments !== undefined) {
    record.comments = payload.comments ? String(payload.comments).trim() : undefined;
  }

  await record.save();

  // Keep the (order, mould) enforcement counter exact after the edit.
  await recomputeCompletedShots(record.orderId, record.moldName);

  // Recompute balances from the full record history — surplus is consumed before finished,
  // finished before pending, automatically (see reconcile.service).
  await reconcileService.reconcileProduct(record.customerId.toString(), record.productId.toString());

  return toPublicMouldingRecord(record);
}

// Delete a moulding record within the 12-hour window. Reverses the stock entry.
async function deleteMouldingRecord(id, user) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid id', 'invalid_id');
  const record = await MouldingRecord.findById(id);
  if (!record) throw notFound('Moulding record not found', 'moulding_record_not_found');

  if (record.createdBy.toString() !== String(user.id)) {
    throw forbidden('You can only delete your own moulding records');
  }
  const ageMs = Date.now() - new Date(record.createdAt).getTime();
  if (ageMs > EDIT_WINDOW_MS) {
    throw forbidden('Delete window has expired (12 hours after creation)', 'delete_window_expired');
  }

  const { customerId, productId, orderId, moldName } = record;
  await MouldingRecord.deleteOne({ _id: record._id });

  // Keep the (order, mould) enforcement counter exact after the delete.
  await recomputeCompletedShots(orderId, moldName);

  // Recompute from the remaining records. If parts were already consumed by assembly, the
  // shortfall surfaces correctly as increased Pending (no false "already consumed" error).
  await reconcileService.reconcileProduct(customerId.toString(), productId.toString());
  return { deleted: true };
}

// Recover good pieces from physically inspected rejected shots. Goes directly to
// product surplus (NOT to the order's pending store). (req #9)
async function recoverPieces({ orderId, productId, customerId, recoveries, createdBy }) {
  for (const [key, val] of Object.entries({ orderId, productId, customerId })) {
    if (!mongoose.Types.ObjectId.isValid(val)) throw badRequest(`Invalid ${key}`, 'invalid_id');
  }
  if (!Array.isArray(recoveries) || recoveries.length === 0) {
    throw badRequest('recoveries array is required', 'missing_recoveries');
  }

  const results = [];
  for (const r of recoveries) {
    const qty = Number(r.goodPieces);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const partName = String(r.partName || '').trim();
    if (!partName) continue;

    await storeService.addToSurplus({
      customerId,
      productId,
      partName,
      moldName: r.moldName || '',
      cavity: Number(r.cavity) || 1,
      quantity: qty,
      referenceId: null,
      remarks: `Recovered from rejected shots (order ${orderId})`,
      createdBy,
    });
    results.push({ partName, goodPieces: qty });
  }

  // Recovery is a product-surplus source (read from the ledger by reconcile) — recompute
  // so the surplus reflects the recovered pieces exactly.
  if (results.length > 0) {
    await reconcileService.reconcileProduct(customerId, productId);
  }
  return { recovered: results };
}

// Moulding dashboard: all customers → their products → active order count.
// Powers the engineer dashboard (req #1).
async function getMouldingDashboard() {
  const customers = await Customer.find().sort({ name: 1 }).lean();
  const result = [];
  for (const c of customers) {
    const products = await Product.find({ customerId: c._id, status: { $ne: 'Archived' } })
      .sort({ name: 1 })
      .lean();
    const productRows = [];
    for (const p of products) {
      const activeOrderDocs = await Order.find({
        customerId: c._id,
        productId: p._id,
        status: 'Active',
        productionStatus: 'Active',
      })
        .select('_id')
        .lean();
      const activeOrders = activeOrderDocs.length;

      // Moulds currently running for this product = distinct molds set up on its active
      // orders, so the dashboard tells engineers what tooling is live (req #8).
      let runningMoulds = [];
      if (activeOrders > 0) {
        const molds = await OrderMold.find({ orderId: { $in: activeOrderDocs.map((o) => o._id) } })
          .select('moldName partName cavity')
          .lean();
        const seen = new Set();
        for (const m of molds) {
          const key = `${m.moldName}·${m.cavity}`;
          if (seen.has(key)) continue;
          seen.add(key);
          runningMoulds.push({ moldName: m.moldName, partName: m.partName || null, cavity: m.cavity });
        }
        // Highest-cavity tooling first (e.g. 11 Cavity, 7 Cavity, 2 Cavity).
        runningMoulds.sort((a, b) => b.cavity - a.cavity);
      }

      productRows.push({
        id: p._id.toString(),
        name: p.name,
        itemCode: p.itemCode || null,
        partName: p.partName || null,
        activeOrders,
        runningMoulds,
      });
    }
    result.push({ id: c._id.toString(), name: c.name, products: productRows });
  }
  return result;
}

// PO-level moulding dashboard (req #4). Groups the item-code jobs by their Purchase Order and
// classifies each PO by moulding completion: ACTIVE = at least one job still in production;
// ARCHIVED = every job's production is Completed. One aggregation (no N+1).
async function getMouldingPODashboard() {
  const rows = await Order.aggregate([
    { $match: { purchaseOrderId: { $ne: null } } },
    {
      $group: {
        _id: '$purchaseOrderId',
        customerId: { $first: '$customerId' },
        itemCount: { $sum: 1 },
        activeItems: { $sum: { $cond: [{ $eq: ['$productionStatus', 'Active'] }, 1, 0] } },
      },
    },
    { $lookup: { from: PurchaseOrder.collection.name, localField: '_id', foreignField: '_id', as: 'po' } },
    { $unwind: '$po' },
    { $lookup: { from: Customer.collection.name, localField: 'customerId', foreignField: '_id', as: 'cust' } },
    { $unwind: { path: '$cust', preserveNullAndEmptyArrays: true } },
    { $sort: { 'po.createdAt': -1 } },
  ]);

  const active = [];
  const archived = [];
  for (const r of rows) {
    const card = {
      id: String(r._id),
      poNumber: r.po.poNumber || null,
      customerName: r.cust ? r.cust.name : null,
      itemCount: r.itemCount,
      activeItems: r.activeItems,
    };
    if (r.activeItems > 0) active.push(card);
    else archived.push(card);
  }
  return { active, archived };
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

// List moulding records — shared visibility (role-based, not user-based, req #7).
// All moulding engineers see ALL records; optional filters by customer/product/order.
async function listMyRecords(_createdBy, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildFilter(query);

  const [items, total] = await Promise.all([
    MouldingRecord.find(filter).populate('imageId').sort({ createdAt: -1 }).skip(skip).limit(limit),
    MouldingRecord.countDocuments(filter),
  ]);

  return buildList(items.map(toPublicMouldingRecord), total, page, limit);
}

// Admin read-all with optional filters.
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

// Fetch one record. Admins may read any; engineers may read any in their dept (req #7).
async function getRecordById(id, user) {
  const record = await MouldingRecord.findById(id).populate('imageId');
  if (!record) throw notFound('Moulding record not found', 'moulding_record_not_found');
  // Engineers can now see all dept records (shared visibility).
  if (user.role !== ROLES.ADMIN && user.role !== ROLES.MOULDING_ENGINEER) {
    throw forbidden('Access denied');
  }
  return toPublicMouldingRecord(record);
}

async function listMoldsForProduct(productId) {
  return moldService.listMoldsForProduct(productId);
}

async function upsertMold(payload, createdBy) {
  return moldService.upsertMold({ ...payload, createdBy });
}

async function listOrderMolds(orderId) {
  return orderMoldService.listForOrder(orderId);
}

async function upsertOrderMold(payload, createdBy) {
  return orderMoldService.upsertOrderMold({ ...payload, createdBy });
}

module.exports = {
  createMouldingRecord,
  updateMouldingRecord,
  deleteMouldingRecord,
  recoverPieces,
  getMouldingDashboard,
  getMouldingPODashboard,
  listMyRecords,
  listAllRecords,
  getRecordById,
  computeOrderStatus,
  listMoldsForProduct,
  upsertMold,
  listOrderMolds,
  upsertOrderMold,
  listRejectionReasons: rejectionReasonService.listReasons,
  persistRejectionReason: (reason, createdBy) => rejectionReasonService.rememberReason(reason, createdBy),
  toPublicMouldingRecord,
};
