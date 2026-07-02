'use strict';

const mongoose = require('mongoose');

// outsourcedcomponentitems — purchased / external parts (axle, sticker sheet, screw
// pack, …) tracked PER ORDER, kept entirely separate from moulded parts so they never
// mix into the Pending / Finished moulding inventory.
//
// Hierarchy: Customer → Product → OrderID → Outsourced Components (name + quantity).
// Component names are remembered for dropdown suggestions on future orders (derived from
// the distinct names already stored for the customer/product). Only Moulding Engineers
// may add / edit / delete / adjust; everyone else is read-only (enforced by the routes).
//
// This row is a DERIVED CACHE — `quantityOnHand` is fully recomputed from OutsourcedReceipt
// transactions + assembly consumption by reconcile.service (never $inc-nudged). It also
// carries the per-order BOM SNAPSHOT: `perSet` is copied from the product's Assortment when
// the order is created, so the order's Required Quantity (= order.orderQuantity × perSet)
// stays frozen even if the master Assortment changes later.
const outsourcedComponentItemSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    componentName: { type: String, required: true, trim: true },
    // Per-order BOM snapshot: parts required per assembled set (frozen at order creation).
    perSet: { type: Number, required: true, default: 0, min: 0 },
    // Derived cache (written by reconcile.service, never $inc-nudged):
    //   requiredQuantity = order.orderQuantity × perSet (snapshot target for this order)
    //   quantityOnHand   = received allocated to this order + surplus drawn − consumption
    //   procurementNeed  = quantity still to PURCHASE after existing surplus is applied
    requiredQuantity: { type: Number, required: true, default: 0, min: 0 },
    quantityOnHand: { type: Number, required: true, default: 0, min: 0 },
    procurementNeed: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// One row per (customer, product, order, component) — makes upserts atomic/idempotent.
outsourcedComponentItemSchema.index(
  { customerId: 1, productId: 1, orderId: 1, componentName: 1 },
  { unique: true }
);
// Drives the suggestion list (distinct names for a customer/product across all orders).
outsourcedComponentItemSchema.index({ customerId: 1, productId: 1 });

module.exports = mongoose.model('OutsourcedComponentItem', outsourcedComponentItemSchema);
