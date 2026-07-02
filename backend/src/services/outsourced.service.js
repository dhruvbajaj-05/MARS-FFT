'use strict';

const mongoose = require('mongoose');
const OutsourcedComponentItem = require('../models/OutsourcedComponentItem');
const OutsourcedSurplusItem = require('../models/OutsourcedSurplusItem');
const OutsourcedReceipt = require('../models/OutsourcedReceipt');
const Order = require('../models/Order');
const reconcileService = require('./reconcile.service');
const { badRequest, notFound, forbidden } = require('../utils/httpError');

// Outsourced Components store — purchased/external parts (sticker, screw, spring, battery…),
// kept fully separate from moulded inventory. Behaves EXACTLY like moulding inventory.
//
// Dead simple, per order (NO master BOM, NO product BOM, NO auto-loading):
//   1. Add a component to the order: name + assortment (qty per finished set).
//   2. Record received quantity. Multiple deliveries just ACCUMULATE onto the same
//      component (each receipt is an immutable OutsourcedReceipt transaction) — exactly the
//      way moulding production accumulates.
//   • reconcile.service derives, per order+component: Required (orderQty × perSet =
//     assortment), Finished (received capped at required), Pending (the shortfall), and
//     product-level Surplus (overage). Surplus rolls forward to future orders automatically
//     (oldest order consumes it first). No special logic.

// Moulding engineers may edit/delete their own receipts within 12h (mirrors moulding).
const EDIT_WINDOW_MS = 12 * 60 * 60 * 1000;

function assertId(value, name) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw badRequest(`A valid ${name} is required`, 'invalid_id');
  }
}

function normalizeName(name) {
  const n = String(name || '').trim();
  if (!n) throw badRequest('componentName is required', 'missing_component_name');
  return n;
}

function normalizeQuantity(quantity, { allowZero = true } = {}) {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n <= 0)) {
    throw badRequest('quantity must be a number >= 0', 'invalid_quantity');
  }
  return n;
}

// Validate that the order exists and matches the customer + product (never trust the client).
async function validateChain({ customerId, productId, orderId }) {
  assertId(customerId, 'customerId');
  assertId(productId, 'productId');
  assertId(orderId, 'orderId');
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

function toPublicComponent(doc, received = 0) {
  return {
    id: doc._id.toString(),
    customerId: doc.customerId.toString(),
    productId: doc.productId.toString(),
    orderId: doc.orderId ? doc.orderId.toString() : null,
    componentName: doc.componentName,
    perSet: doc.perSet || 0,
    requiredQuantity: doc.requiredQuantity || 0,
    quantityOnHand: doc.quantityOnHand || 0,
    procurementNeed: doc.procurementNeed || 0,
    received,
    updatedAt: doc.updatedAt,
  };
}

function toPublicSurplus(doc) {
  return {
    id: doc._id.toString(),
    customerId: doc.customerId.toString(),
    productId: doc.productId.toString(),
    orderId: null,
    componentName: doc.componentName,
    perSet: 0,
    requiredQuantity: 0,
    quantityOnHand: doc.quantityOnHand || 0,
    procurementNeed: 0,
    received: 0,
    updatedAt: doc.updatedAt,
  };
}

function toPublicReceipt(doc) {
  return {
    id: doc._id.toString(),
    customerId: doc.customerId.toString(),
    productId: doc.productId.toString(),
    orderId: doc.orderId.toString(),
    componentName: doc.componentName,
    quantityReceived: doc.quantityReceived,
    perSet: doc.perSet || 0,
    remarks: doc.remarks || null,
    createdBy: doc.createdBy.toString(),
    createdAt: doc.createdAt,
    canEdit: (Date.now() - new Date(doc.createdAt).getTime()) < EDIT_WINDOW_MS,
  };
}

// ---- Reads ------------------------------------------------------------------

// This order's outsourced components (with derived Required/OnHand/Procurement) + the
// product-level surplus + name suggestions + the receipt history for this order.
async function listForOrder({ customerId, productId, orderId }) {
  assertId(customerId, 'customerId');
  assertId(productId, 'productId');
  assertId(orderId, 'orderId');

  const [components, surplus, names, receipts, receivedAgg] = await Promise.all([
    OutsourcedComponentItem.find({ customerId, productId, orderId }).sort({ componentName: 1 }).lean(),
    OutsourcedSurplusItem.find({ customerId, productId, quantityOnHand: { $gt: 0 } }).sort({ componentName: 1 }).lean(),
    OutsourcedComponentItem.distinct('componentName', { customerId, productId }),
    OutsourcedReceipt.find({ customerId, productId, orderId }).sort({ createdAt: -1 }).lean(),
    OutsourcedReceipt.aggregate([
      { $match: { customerId: new mongoose.Types.ObjectId(customerId), productId: new mongoose.Types.ObjectId(productId), orderId: new mongoose.Types.ObjectId(orderId) } },
      { $group: { _id: '$componentName', received: { $sum: '$quantityReceived' } } },
    ]),
  ]);

  const receivedByComp = new Map(receivedAgg.map((r) => [r._id, r.received]));

  return {
    customerId: String(customerId),
    productId: String(productId),
    orderId: String(orderId),
    components: components.map((c) => toPublicComponent(c, receivedByComp.get(c.componentName) || 0)),
    surplus: surplus.map(toPublicSurplus),
    receipts: receipts.map(toPublicReceipt),
    suggestions: names.sort((a, b) => a.localeCompare(b)),
  };
}

// Distinct component names ever used for this customer/product (dropdown suggestions).
async function suggestions({ customerId, productId }) {
  assertId(customerId, 'customerId');
  assertId(productId, 'productId');
  const names = await OutsourcedComponentItem.distinct('componentName', { customerId, productId });
  return { suggestions: names.sort((a, b) => a.localeCompare(b)) };
}

// ---- Order component editing (order-scoped) ---------------------------------

// Add or update a component in THIS order (name + assortment/per-set). Changing perSet
// recomputes Required (= orderQty × perSet), Finished, Pending and Surplus.
async function setBomRow({ customerId, productId, orderId, componentName, perSet }) {
  const name = normalizeName(componentName);
  const per = normalizeQuantity(perSet);
  await validateChain({ customerId, productId, orderId });

  await OutsourcedComponentItem.findOneAndUpdate(
    { customerId, productId, orderId, componentName: name },
    { $set: { perSet: per } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await reconcileService.reconcileOutsourced(customerId, productId);
  const doc = await OutsourcedComponentItem.findOne({ customerId, productId, orderId, componentName: name }).lean();
  return toPublicComponent(doc);
}

// Remove a component from THIS order. Only allowed when it has no receipts (otherwise
// deleting the receipts first keeps the audit trail intact).
async function removeBomRow({ id }) {
  assertId(id, 'id');
  const doc = await OutsourcedComponentItem.findById(id);
  if (!doc) return { id: String(id), deleted: false };
  const receiptCount = await OutsourcedReceipt.countDocuments({
    customerId: doc.customerId, productId: doc.productId, orderId: doc.orderId, componentName: doc.componentName,
  });
  if (receiptCount > 0) {
    throw badRequest('Delete the received transactions for this component first', 'has_receipts');
  }
  await OutsourcedComponentItem.deleteOne({ _id: doc._id });
  await reconcileService.reconcileOutsourced(doc.customerId.toString(), doc.productId.toString());
  return { id: String(id), deleted: true };
}

// ---- Receipts (transaction-based inventory) --------------------------------

// Record received outsourced stock for an order. Optionally (re)sets the component's
// assortment (per-set). Multiple deliveries ACCUMULATE via separate receipts; the balance
// (Finished / Pending / Surplus) is DERIVED by reconcile.
async function createReceipt({ customerId, productId, orderId, componentName, quantityReceived, perSet, remarks, createdBy }) {
  const name = normalizeName(componentName);
  await validateChain({ customerId, productId, orderId });
  const qty = normalizeQuantity(quantityReceived, { allowZero: false });
  const hasPerSet = perSet !== undefined && perSet !== null && perSet !== '';
  const per = hasPerSet ? normalizeQuantity(perSet) : undefined;

  // Ensure the order's component row exists (and refresh assortment/per-set if supplied).
  await OutsourcedComponentItem.findOneAndUpdate(
    { customerId, productId, orderId, componentName: name },
    hasPerSet ? { $set: { perSet: per } } : { $setOnInsert: { perSet: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const receipt = await OutsourcedReceipt.create({
    customerId, productId, orderId, componentName: name,
    quantityReceived: qty, perSet: per || 0,
    remarks: remarks ? String(remarks).trim() : undefined,
    createdBy,
  });

  await reconcileService.reconcileOutsourced(customerId, productId);
  return toPublicReceipt(receipt);
}

async function listReceipts({ customerId, productId, orderId }) {
  assertId(customerId, 'customerId');
  assertId(productId, 'productId');
  assertId(orderId, 'orderId');
  const receipts = await OutsourcedReceipt.find({ customerId, productId, orderId }).sort({ createdAt: -1 }).lean();
  return { receipts: receipts.map(toPublicReceipt) };
}

async function updateReceipt({ id, quantityReceived, remarks, user }) {
  assertId(id, 'id');
  const receipt = await OutsourcedReceipt.findById(id);
  if (!receipt) throw notFound('Receipt not found', 'receipt_not_found');
  if (receipt.createdBy.toString() !== String(user.id)) {
    throw forbidden('You can only edit your own receipts');
  }
  if (Date.now() - new Date(receipt.createdAt).getTime() > EDIT_WINDOW_MS) {
    throw forbidden('Edit window has expired (12 hours after creation)', 'edit_window_expired');
  }
  if (quantityReceived !== undefined) {
    receipt.quantityReceived = normalizeQuantity(quantityReceived, { allowZero: false });
  }
  if (remarks !== undefined) receipt.remarks = remarks ? String(remarks).trim() : undefined;
  await receipt.save();
  await reconcileService.reconcileOutsourced(receipt.customerId.toString(), receipt.productId.toString());
  return toPublicReceipt(receipt);
}

async function deleteReceipt({ id, user }) {
  assertId(id, 'id');
  const receipt = await OutsourcedReceipt.findById(id);
  if (!receipt) return { id: String(id), deleted: false };
  if (receipt.createdBy.toString() !== String(user.id)) {
    throw forbidden('You can only delete your own receipts');
  }
  if (Date.now() - new Date(receipt.createdAt).getTime() > EDIT_WINDOW_MS) {
    throw forbidden('Delete window has expired (12 hours after creation)', 'delete_window_expired');
  }
  const { customerId, productId } = receipt;
  await OutsourcedReceipt.deleteOne({ _id: receipt._id });
  await reconcileService.reconcileOutsourced(customerId.toString(), productId.toString());
  return { id: String(id), deleted: true };
}

// ---- Assembly integration (reads only; consumption is derived by reconcile) ----

const ComponentMatch = (customerId, productId, orderId) => ({ customerId, productId, orderId });

// Map componentName → quantityOnHand for this order's outsourced components (pre-validation).
async function getOrderQuantities({ customerId, productId, orderId }) {
  const rows = await OutsourcedComponentItem.find(ComponentMatch(customerId, productId, orderId)).lean();
  return new Map(rows.map((r) => [r.componentName, r.quantityOnHand]));
}

// Map componentName → quantityOnHand for the product-level outsourced surplus (pre-validation).
async function getSurplusQuantities({ customerId, productId }) {
  const rows = await OutsourcedSurplusItem.find({ customerId, productId }).lean();
  return new Map(rows.map((r) => [r.componentName, r.quantityOnHand]));
}

// Per-order outsourced BOM (componentName → perSet) — the snapshot assembly consumes against.
async function getOrderBom({ customerId, productId, orderId }) {
  const rows = await OutsourcedComponentItem.find(ComponentMatch(customerId, productId, orderId)).lean();
  return rows.map((r) => ({ partName: r.componentName, perSet: r.perSet || 0, kind: 'outsourced' }));
}

module.exports = {
  listForOrder,
  suggestions,
  setBomRow,
  removeBomRow,
  createReceipt,
  listReceipts,
  updateReceipt,
  deleteReceipt,
  getOrderQuantities,
  getSurplusQuantities,
  getOrderBom,
};
