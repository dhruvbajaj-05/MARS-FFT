'use strict';

const mongoose = require('mongoose');
const OutsourcedComponentItem = require('../models/OutsourcedComponentItem');
const OutsourcedSurplusItem = require('../models/OutsourcedSurplusItem');
const Order = require('../models/Order');
const assortmentService = require('./assortment.service');
const { badRequest, notFound, conflict } = require('../utils/httpError');

// Outsourced Components store — purchased/external parts, tracked per OrderID and kept
// fully separate from moulded inventory. Moulding Engineers manage the data (routes
// enforce that); everyone else reads. A product-level Surplus mirror is also tracked.

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

function toPublic(doc) {
  return {
    id: doc._id.toString(),
    customerId: doc.customerId.toString(),
    productId: doc.productId.toString(),
    orderId: doc.orderId ? doc.orderId.toString() : null,
    componentName: doc.componentName,
    quantityOnHand: doc.quantityOnHand,
    updatedAt: doc.updatedAt,
  };
}

// Read: this order's outsourced components + the product-level surplus + name suggestions.
async function listForOrder({ customerId, productId, orderId }) {
  assertId(customerId, 'customerId');
  assertId(productId, 'productId');
  assertId(orderId, 'orderId');

  const [components, surplus, names] = await Promise.all([
    OutsourcedComponentItem.find({ customerId, productId, orderId }).sort({ componentName: 1 }).lean(),
    OutsourcedSurplusItem.find({ customerId, productId, quantityOnHand: { $gt: 0 } })
      .sort({ componentName: 1 })
      .lean(),
    OutsourcedComponentItem.distinct('componentName', { customerId, productId }),
  ]);

  return {
    customerId: String(customerId),
    productId: String(productId),
    orderId: String(orderId),
    components: components.map(toPublic),
    surplus: surplus.map(toPublic),
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

// Create or update a component (scope 'order' → order cell, 'surplus' → product level).
// mode 'set' (default) writes the absolute quantity; 'add' increments it.
async function upsert({ scope = 'order', customerId, productId, orderId, componentName, quantity, mode = 'set' }) {
  const name = normalizeName(componentName);
  const qty = normalizeQuantity(quantity);

  if (scope === 'surplus') {
    assertId(customerId, 'customerId');
    assertId(productId, 'productId');
    const update = mode === 'add' ? { $inc: { quantityOnHand: qty } } : { $set: { quantityOnHand: qty } };
    const doc = await OutsourcedSurplusItem.findOneAndUpdate(
      { customerId, productId, componentName: name },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return toPublic(doc);
  }

  await validateChain({ customerId, productId, orderId });
  const update = mode === 'add' ? { $inc: { quantityOnHand: qty } } : { $set: { quantityOnHand: qty } };
  const doc = await OutsourcedComponentItem.findOneAndUpdate(
    { customerId, productId, orderId, componentName: name },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return toPublic(doc);
}

// Inc an order cell / surplus cell by a positive quantity (race-tolerant upsert).
async function incCell(Model, filter, set, quantity) {
  const update = { $inc: { quantityOnHand: quantity } };
  if (set && Object.keys(set).length) update.$set = set;
  try {
    return await Model.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (err) {
    if (err && err.code === 11000) return Model.findOneAndUpdate(filter, update, { new: true });
    throw err;
  }
}

// RULE 3 — Outsourced allocation. The Moulding Engineer enters Quantity Received + the
// Per-Set requirement. The system splits IMMEDIATELY: up to (orderSets × perSet) is
// allocated to the OrderID cell; the remainder goes to the shared product surplus. The
// per-set value is also recorded on the assortment (kind 'outsourced') so Assembly knows
// how much to consume per set. Never all-to-order, never all-to-surplus.
async function allocate({ customerId, productId, orderId, componentName, received, perSet, createdBy }) {
  const name = normalizeName(componentName);
  const order = await validateChain({ customerId, productId, orderId });
  const recv = Number(received);
  if (!Number.isFinite(recv) || recv <= 0) throw badRequest('quantityReceived must be a number > 0', 'invalid_quantity');
  const per = Number(perSet);
  if (!Number.isFinite(per) || per < 0) throw badRequest('perSet must be a number >= 0', 'invalid_per_set');

  const required = (order.orderQuantity || 0) * per;
  const existing = await OutsourcedComponentItem.findOne({ customerId, productId, orderId, componentName: name }).lean();
  const current = existing ? existing.quantityOnHand : 0;
  const capacity = Math.max(0, required - current);
  const toOrder = Math.min(recv, capacity);
  const toSurplus = recv - toOrder;

  if (toOrder > 0) {
    await incCell(OutsourcedComponentItem, { customerId, productId, orderId, componentName: name }, {}, toOrder);
  } else {
    // Ensure the order cell exists even when this receipt is all surplus (keeps it visible).
    await incCell(OutsourcedComponentItem, { customerId, productId, orderId, componentName: name }, {}, 0);
  }
  if (toSurplus > 0) {
    await incCell(OutsourcedSurplusItem, { customerId, productId, componentName: name }, {}, toSurplus);
  }

  // Record per-set on the assortment so Assembly consumes outsourced parts automatically.
  if (per > 0) {
    await assortmentService.mergePart({ customerId, productId, partName: name, perSet: per, kind: 'outsourced', updatedBy: createdBy });
  }

  return {
    componentName: name,
    requiredQuantity: required,
    orderAllocation: current + toOrder,
    addedToOrder: toOrder,
    addedToSurplus: toSurplus,
  };
}

function modelForScope(scope) {
  return scope === 'surplus' ? OutsourcedSurplusItem : OutsourcedComponentItem;
}

// Adjust an existing row by a signed delta (e.g. +10 received, -3 correction). Clamped at 0.
async function adjust({ id, scope = 'order', delta }) {
  assertId(id, 'id');
  const d = Number(delta);
  if (!Number.isFinite(d)) throw badRequest('delta must be a number', 'invalid_quantity');
  const Model = modelForScope(scope);
  const doc = await Model.findById(id);
  if (!doc) throw notFound('Outsourced component not found', 'outsourced_not_found');
  doc.quantityOnHand = Math.max(0, doc.quantityOnHand + d);
  await doc.save();
  return toPublic(doc);
}

// Set an existing row's absolute quantity.
async function setQuantity({ id, scope = 'order', quantity }) {
  assertId(id, 'id');
  const qty = normalizeQuantity(quantity);
  const Model = modelForScope(scope);
  const doc = await Model.findByIdAndUpdate(id, { $set: { quantityOnHand: qty } }, { new: true });
  if (!doc) throw notFound('Outsourced component not found', 'outsourced_not_found');
  return toPublic(doc);
}

// Idempotent delete — deleting an already-gone row is treated as success (no orphan
// rows, no error state on double-tap). Removes the single matched cell only.
async function remove({ id, scope = 'order' }) {
  assertId(id, 'id');
  const Model = modelForScope(scope);
  const doc = await Model.findByIdAndDelete(id);
  return { id: String(id), deleted: !!doc };
}

// ---- Assembly integration: consume order/surplus quantities, transfer on completion ----

const ComponentMatch = (customerId, productId, orderId) => ({ customerId, productId, orderId });

// Map componentName → quantityOnHand for this order's outsourced components.
async function getOrderQuantities({ customerId, productId, orderId }) {
  const rows = await OutsourcedComponentItem.find(ComponentMatch(customerId, productId, orderId)).lean();
  return new Map(rows.map((r) => [r.componentName, r.quantityOnHand]));
}

// Map componentName → quantityOnHand for the product-level outsourced surplus.
async function getSurplusQuantities({ customerId, productId }) {
  const rows = await OutsourcedSurplusItem.find({ customerId, productId }).lean();
  return new Map(rows.map((r) => [r.componentName, r.quantityOnHand]));
}

// Guarded decrement of an ORDER outsourced component (normal assembly consumption).
async function consumeOrder({ customerId, productId, orderId, componentName, quantity }) {
  const updated = await OutsourcedComponentItem.findOneAndUpdate(
    { customerId, productId, orderId, componentName, quantityOnHand: { $gte: quantity } },
    { $inc: { quantityOnHand: -quantity } },
    { new: true }
  );
  if (!updated) throw conflict(`Insufficient outsourced stock for ${componentName}`, 'insufficient_outsourced');
  return updated;
}

// Guarded decrement of an outsourced SURPLUS component (extra sets from surplus).
async function consumeSurplus({ customerId, productId, componentName, quantity }) {
  const updated = await OutsourcedSurplusItem.findOneAndUpdate(
    { customerId, productId, componentName, quantityOnHand: { $gte: quantity } },
    { $inc: { quantityOnHand: -quantity } },
    { new: true }
  );
  if (!updated) throw conflict(`Insufficient outsourced surplus for ${componentName}`, 'insufficient_outsourced_surplus');
  return updated;
}

// On assembly completion, move every remaining ORDER outsourced quantity into the
// product-level outsourced surplus (matched + added), then zero the order cell.
async function transferOrderToSurplus({ customerId, productId, orderId }) {
  const rows = await OutsourcedComponentItem.find({ ...ComponentMatch(customerId, productId, orderId), quantityOnHand: { $gt: 0 } });
  const moved = [];
  for (const row of rows) {
    const qty = row.quantityOnHand;
    await OutsourcedSurplusItem.findOneAndUpdate(
      { customerId, productId, componentName: row.componentName },
      { $inc: { quantityOnHand: qty } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).catch(async (err) => {
      if (err && err.code === 11000) {
        return OutsourcedSurplusItem.findOneAndUpdate(
          { customerId, productId, componentName: row.componentName },
          { $inc: { quantityOnHand: qty } },
          { new: true }
        );
      }
      throw err;
    });
    row.quantityOnHand = 0;
    await row.save();
    moved.push({ componentName: row.componentName, quantity: qty });
  }
  return moved;
}

module.exports = {
  listForOrder,
  suggestions,
  upsert,
  allocate,
  adjust,
  setQuantity,
  remove,
  getOrderQuantities,
  getSurplusQuantities,
  consumeOrder,
  consumeSurplus,
  transferOrderToSurplus,
};
