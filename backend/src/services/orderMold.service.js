'use strict';

const mongoose = require('mongoose');
const OrderMold = require('../models/OrderMold');
const Order = require('../models/Order');
const MouldingRecord = require('../models/MouldingRecord');
const moldService = require('./mold.service');
const reconcileService = require('./reconcile.service');
const { badRequest, notFound, conflict } = require('../utils/httpError');

// Shape an order-mold for client responses. requiredQuantity (= requiredShots × cavity)
// is the per-order Component Store target this mold's part must reach to be Finished.
function toPublicOrderMold(m) {
  return {
    id: m._id.toString(),
    orderId: m.orderId.toString(),
    customerId: m.customerId.toString(),
    productId: m.productId.toString(),
    moldName: m.moldName,
    partName: m.partName,
    cavity: m.cavity,
    requiredShots: m.requiredShots,
    requiredQuantity: (m.requiredShots || 0) * (m.cavity || 0),
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

// Validate that the order exists and matches the customer/product (never trust the
// client cascade). Returns the order document.
async function validateOrder({ orderId, customerId, productId }) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw badRequest('Invalid orderId', 'invalid_id');
  }
  const order = await Order.findById(orderId);
  if (!order) {
    throw badRequest('orderId does not reference an existing order', 'invalid_order');
  }
  if (customerId && order.customerId.toString() !== String(customerId)) {
    throw badRequest('customerId does not match the order', 'customer_order_mismatch');
  }
  if (productId && order.productId.toString() !== String(productId)) {
    throw badRequest('productId does not match the order', 'product_order_mismatch');
  }
  return order;
}

// Define or edit a mold for ONE order (Mould Setup). Upsert on (orderId, moldName) so
// the setup is editable and idempotent. Saving also reinforces the product-level
// MoldDefinition so future orders surface this mold/part/cavity as a suggestion.
//
// EVERY field is editable — including the mold NAME (req #9). When `originalMoldName` is
// supplied and differs from the new name, the existing setup row is RENAMED (and any
// moulding records already pushed under the old name are re-tagged) so progress/history
// stay attached to the mold.
async function upsertOrderMold({ orderId, customerId, productId, moldName, partName, cavity, requiredShots, originalMoldName, createdBy }) {
  const order = await validateOrder({ orderId, customerId, productId });
  const cust = order.customerId.toString();
  const prod = order.productId.toString();

  const name = String(moldName || '').trim();
  const part = String(partName || '').trim();
  if (!name) throw badRequest('moldName is required', 'missing_mold_name');
  if (!part) throw badRequest('partName is required', 'missing_part');

  const cav = Number(cavity);
  if (!Number.isFinite(cav) || cav < 1) {
    throw badRequest('cavity must be a number >= 1', 'invalid_cavity');
  }
  const shots = requiredShots === undefined || requiredShots === null || requiredShots === ''
    ? 0
    : Number(requiredShots);
  if (!Number.isFinite(shots) || shots < 0) {
    throw badRequest('requiredShots must be a number >= 0', 'invalid_required_shots');
  }

  // Rename path: the engineer edited the mold NAME of an existing setup row.
  const oldName = String(originalMoldName || '').trim();
  if (oldName && oldName !== name) {
    const existing = await OrderMold.findOne({ orderId, moldName: oldName });
    if (existing) {
      // Guard against colliding with a different mold that already uses the new name.
      const clash = await OrderMold.findOne({ orderId, moldName: name });
      if (clash) {
        throw conflict(`A mold named "${name}" already exists for this order`, 'mold_name_conflict');
      }
      existing.moldName = name;
      existing.partName = part;
      existing.cavity = cav;
      existing.requiredShots = shots;
      await existing.save();
      // Re-tag production already pushed under the old name so per-mold progress follows.
      await MouldingRecord.updateMany(
        { orderId, moldName: oldName },
        { $set: { moldName: name } }
      );
      await moldService.upsertMold({ customerId: cust, productId: prod, moldName: name, partName: part, cavity: cav, requiredShots: shots, createdBy });
      await reconcileService.reconcileProduct(cust, prod);
      return toPublicOrderMold(existing);
    }
    // No row under the old name — fall through and treat as a normal create of `name`.
  }

  const mold = await OrderMold.findOneAndUpdate(
    { orderId, moldName: name },
    {
      $set: { partName: part, cavity: cav, requiredShots: shots },
      $setOnInsert: { customerId: cust, productId: prod, createdBy },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Reinforce the product-level memory (dropdown suggestions for future orders).
  await moldService.upsertMold({
    customerId: cust,
    productId: prod,
    moldName: name,
    partName: part,
    cavity: cav,
    requiredShots: shots,
    createdBy,
  });

  // Required Quantity (= requiredShots × cavity) drives the Pending/Finished/Surplus split,
  // so recompute the component store whenever an order's mold target changes.
  await reconcileService.reconcileProduct(cust, prod);

  return toPublicOrderMold(mold);
}

// List the molds set up for an order, merged with product-level suggestions. Each row
// is flagged `defined: true` when it is an actual OrderMold for this order, or
// `defined: false` when it is only a learned suggestion the engineer can adopt.
async function listForOrder(orderId) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw badRequest('A valid orderId is required', 'invalid_id');
  }
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Order not found', 'order_not_found');

  const [molds, suggestionsResp] = await Promise.all([
    OrderMold.find({ orderId }).sort({ moldName: 1 }),
    moldService.listMoldsForProduct(order.productId.toString()),
  ]);

  const defined = molds.map(toPublicOrderMold);
  const definedNames = new Set(defined.map((m) => m.moldName.toLowerCase()));

  // Suggestions = learned molds for the product not yet set up on this order.
  const suggestions = (suggestionsResp.molds || [])
    .filter((s) => !definedNames.has(String(s.moldName).toLowerCase()))
    .map((s) => ({
      moldName: s.moldName,
      partName: s.defaultPartName || s.partName,
      cavity: s.cavity,
      requiredShots: s.requiredShots,
      requiredQuantity: s.requiredQuantity,
    }));

  // PO-level suggestions: physical moulds already configured on OTHER item-code jobs in the
  // SAME purchase order (req #6). The engineer reuses the mould identity + cavity + part and
  // only sets a NEW Required Shots for this item code. requiredShots is intentionally omitted
  // so the previous item code's target is never inherited.
  let poSuggestions = [];
  if (order.purchaseOrderId) {
    const siblingJobs = await Order.find({
      purchaseOrderId: order.purchaseOrderId,
      _id: { $ne: order._id },
    })
      .select('_id')
      .lean();
    if (siblingJobs.length > 0) {
      const sibMolds = await OrderMold.find({ orderId: { $in: siblingJobs.map((o) => o._id) } })
        .select('moldName partName cavity')
        .lean();
      const seen = new Set(definedNames); // don't re-offer moulds already on this order
      for (const m of sibMolds) {
        const key = String(m.moldName).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        poSuggestions.push({ moldName: m.moldName, partName: m.partName, cavity: m.cavity });
      }
      poSuggestions.sort((a, b) => a.moldName.localeCompare(b.moldName));
    }
  }

  return {
    orderId: String(orderId),
    customerId: order.customerId.toString(),
    productId: order.productId.toString(),
    molds: defined,
    suggestions,
    poSuggestions,
  };
}

// Look up a single order-mold by (order, moldName) — used by moulding production to
// resolve cavity/requiredShots server-side (never trust client-supplied cavity).
async function findOrderMold(orderId, moldName) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) return null;
  return OrderMold.findOne({ orderId, moldName: String(moldName || '').trim() });
}

module.exports = {
  upsertOrderMold,
  listForOrder,
  findOrderMold,
  toPublicOrderMold,
};
