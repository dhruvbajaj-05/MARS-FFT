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

// Sum of requiredShots across all molds set up for an order — the true SHOT target that
// governs production completion (rejected shots count toward it).
async function computeTargetShots(orderId) {
  const [agg] = await OrderMold.aggregate([
    { $match: { orderId: new mongoose.Types.ObjectId(String(orderId)) } },
    { $group: { _id: null, total: { $sum: '$requiredShots' } } },
  ]);
  return agg?.total ?? 0;
}

// Recompute the (order, mould) enforcement counter from the record history and persist it.
// Keeps OrderMold.completedShots exact after edits/deletes (self-healing — never drifts).
async function recomputeCompletedShots(orderId, moldName) {
  const [agg] = await MouldingRecord.aggregate([
    { $match: { orderId: new mongoose.Types.ObjectId(String(orderId)), moldName } },
    // The completion counter tracks GOOD shots (shots − rejected): rejected shots never count
    // toward the target, so raising rejects on an edit lowers this and reopens the mould.
    { $group: { _id: null, total: { $sum: { $subtract: ['$shotsDone', { $ifNull: ['$rejectedShots', 0] }] } } } },
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
          rejectedShots: { $sum: '$rejectedShots' },
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
  // Completion + progress are measured in GOOD SHOTS (shotsDone − rejectedShots): rejected
  // shots do NOT count toward the target, so a mould is complete only once its GOOD shots reach
  // requiredShots. The Entry page shows SHOTS; good pieces / surplus (pieces) are a Store concern.
  const moldProgress = orderMolds.map((m) => {
    const prod = prodByMold[m.moldName] || { shotsDone: 0, rejectedShots: 0, goodParts: 0 };
    const requiredShots = m.requiredShots || 0;
    const cavity = m.cavity || 1;
    const shotsDone = prod.shotsDone || 0;
    const rejectedShots = prod.rejectedShots || 0;
    const goodShots = Math.max(0, shotsDone - rejectedShots);
    const goodParts = prod.goodParts || 0;
    const requiredPieces = requiredShots * cavity;
    const isComplete = requiredShots > 0 && goodShots >= requiredShots;
    // Progress is DISPLAYED capped at the target and never exceeds 100%: once a mould's GOOD
    // shots reach the target it shows "13,590 / 13,590 ✓ Done", and the overage is tracked as
    // SURPLUS (good shots beyond target × cavity → the store's pieces figure). `shotsDone`/
    // `goodShots`/`goodParts` remain the true actuals; `display*` are what the UI caps at target.
    const displayShots = requiredShots > 0 ? Math.min(goodShots, requiredShots) : goodShots;
    const surplusShots = requiredShots > 0 ? Math.max(0, goodShots - requiredShots) : 0;
    return {
      moldName: m.moldName,
      partName: m.partName,
      cavity,
      requiredShots,
      requiredPieces,
      shotsDone,
      rejectedShots,
      goodShots,
      goodParts,
      // UI-facing, capped at the target so progress never exceeds the plan.
      displayShots,
      displayGoodParts: requiredPieces > 0 ? Math.min(goodParts, requiredPieces) : goodParts,
      surplusShots,
      surplusPieces: surplusShots * cavity,
      progressPct: requiredShots > 0 ? Math.min(100, Math.round((goodShots / requiredShots) * 100)) : (goodShots > 0 ? 100 : 0),
      // Complete when the GOOD-shot target is reached (rejected shots excluded).
      isComplete,
    };
  });

  // Overall status: ALL molds with a shot target must have reached it (in GOOD shots).
  const moldsWithTargets = moldProgress.filter((m) => m.requiredShots > 0);
  const totalTargetShots = moldsWithTargets.reduce((s, m) => s + m.requiredShots, 0);
  const totalShotsDone = moldsWithTargets.reduce((s, m) => s + m.goodShots, 0);
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
  // Progress % tracks SHOTS against the shot target (falls back to good-parts/qty when no
  // shot target is configured, so untargeted orders still show sensible progress).
  const progressPct = totalTargetShots > 0
    ? Math.min(100, Math.round((totalShotsDone / totalTargetShots) * 100))
    : orderQuantity > 0
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

// Keep the Item Code (Order) and its Purchase Order completion state in lock-step with the
// derived production status — the SINGLE source of truth. No manual "Complete Production"
// button anywhere: an Item Code is Done the instant every mould reaches its target, and a PO
// auto-archives the instant every Item Code is Done. Edits/deletes that drop production back
// below target automatically reopen the Item Code (and un-archive the PO).
async function syncCompletionState(order, orderStatus) {
  const done = orderStatus.status === 'Completed';
  let changed = false;
  if (done && order.productionStatus !== 'Completed') {
    order.productionStatus = 'Completed';
    order.productionCompletedAt = order.productionCompletedAt || new Date();
    if (order.assemblyStatus === 'Completed' && order.status !== 'Completed') {
      order.status = 'Completed';
      order.completedAt = order.completedAt || new Date();
    }
    changed = true;
  } else if (!done && order.productionStatus === 'Completed') {
    order.productionStatus = 'Active';
    order.productionCompletedAt = null;
    if (order.status === 'Completed') {
      order.status = 'Active';
      order.completedAt = null;
    }
    changed = true;
  }
  if (changed) await order.save();
  if (order.purchaseOrderId) await syncPurchaseOrderArchive(order.purchaseOrderId);
}

// A PurchaseOrder auto-archives (read-only) once every Item Code's PRODUCTION is Completed,
// and auto-reopens if any Item Code drops back into production. Purely derived — never a button.
async function syncPurchaseOrderArchive(purchaseOrderId) {
  const jobs = await Order.find({ purchaseOrderId }).select('productionStatus').lean();
  if (jobs.length === 0) return;
  const allProductionDone = jobs.every((j) => j.productionStatus === 'Completed');
  const po = await PurchaseOrder.findById(purchaseOrderId);
  if (!po) return;
  if (allProductionDone && po.status !== 'Archived') {
    po.status = 'Archived';
    po.archivedAt = po.archivedAt || new Date();
    po.completedAt = po.completedAt || new Date();
    await po.save();
  } else if (!allProductionDone && po.status === 'Archived') {
    po.status = 'Open';
    po.archivedAt = null;
    await po.save();
  }
}

// Read-only guard: once a PO is archived (all production complete) it is history — no more
// production entries, mould edits, QC uploads or store writes for any of its Item Codes.
async function assertPurchaseOrderNotArchived(order) {
  if (!order.purchaseOrderId) return;
  const po = await PurchaseOrder.findById(order.purchaseOrderId).select('status');
  if (po && po.status === 'Archived') {
    throw conflict(
      'This purchase order is complete and archived — it is read-only. Production, mould setup and QC are closed.',
      'po_archived'
    );
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

  // Archived PO = read-only (all Item Codes' production complete). Nothing new is accepted.
  await assertPurchaseOrderNotArchived(order);

  if (order.status === 'Archived') {
    throw conflict(
      'Production for this order is already completed — the moulding workspace is closed.',
      'production_completed'
    );
  }

  if (order.productionStatus === 'Completed') {
    // Self-heal: production completion is measured in SHOTS. If the order was auto-completed
    // but its moulds have NOT all reached their shot targets, reopen it so the engineer can
    // continue. Otherwise the workspace stays closed. (Per-mould over-target entries are still
    // blocked individually by the completion lock below.)
    const targetShots = await computeTargetShots(order._id);
    if (targetShots > 0) {
      const [existingAgg] = await MouldingRecord.aggregate([
        { $match: { orderId: order._id } },
        // Good shots only (rejected shots don't count toward the target).
        { $group: { _id: null, total: { $sum: { $subtract: ['$shotsDone', { $ifNull: ['$rejectedShots', 0] }] } } } },
      ]);
      const currentShots = existingAgg?.total ?? 0;
      if (currentShots < targetShots) {
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

  // ---- Per-(order, mould) completion lock (concurrency-safe) --------------------
  // The target is measured in GOOD SHOTS (shotsDone − rejectedShots): rejected shots never
  // count toward it. Over-production is allowed ON THE ENTRY THAT REACHES the target: factories
  // don't stop the machine exactly on the number, so the single entry that crosses requiredShots
  // is accepted in full (its good overage flows to Surplus). Once the target has been reached,
  // the mould is COMPLETE and no further entries are accepted.
  //
  // We enforce this atomically: increment completedShots (good shots) only while it is still
  // BELOW the target. The first entry that finds completedShots < requiredShots wins (even if it
  // overshoots); every entry after that finds completedShots >= requiredShots and is rejected.
  const goodShotsDelta = Math.max(0, fields.shotsDone - fields.rejectedShots);
  let reservedOnMold = null;
  if (orderMold && orderMold.requiredShots > 0) {
    const guarded = await OrderMold.findOneAndUpdate(
      {
        _id: orderMold._id,
        $expr: { $lt: [{ $ifNull: ['$completedShots', 0] }, '$requiredShots'] },
      },
      { $inc: { completedShots: goodShotsDelta } },
      { new: true }
    );
    if (!guarded) {
      throw conflict(
        `Mould ${moldName} has reached its target of ${orderMold.requiredShots} good shots for this item code and is now complete — no further production can be entered.`,
        'mould_completed'
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
    // Release the reserved good shots if the record couldn't be written, so the guard counter
    // never drifts above the real record total.
    if (reservedOnMold) {
      await OrderMold.updateOne({ _id: reservedOnMold }, { $inc: { completedShots: -goodShotsDelta } }).catch(() => {});
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

  // Item Code Done → PO auto-archive, all derived from the same production state (no button).
  await syncCompletionState(order, orderStatus);

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

    // No target cap on edit either — over-production is allowed and flows to Surplus.
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

  // An edit can push a mould over its target (Item Code Done) or pull it back under (reopen);
  // re-derive the Item Code + PO completion state from the same production truth.
  const editedOrder = await Order.findById(record.orderId);
  if (editedOrder) await syncCompletionState(editedOrder, await computeOrderStatus(record.orderId));

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

  // Deleting production can drop a mould back under target — reopen the Item Code + PO.
  const remainingOrder = await Order.findById(orderId);
  if (remainingOrder) await syncCompletionState(remainingOrder, await computeOrderStatus(orderId));
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

  // Archived PO is read-only — no surplus recovery into a completed job's store either.
  const recoverOrder = await Order.findById(orderId);
  if (recoverOrder) await assertPurchaseOrderNotArchived(recoverOrder);

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
