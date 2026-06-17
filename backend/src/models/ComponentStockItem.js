'use strict';

const mongoose = require('mongoose');

// componentstockitems — Component Store balance table (revised: ORDER-scoped).
//
// One materialized balance per (customer, product, order, mold-part). Moulding
// submissions increment `quantityOnHand` atomically ($inc upsert) into the bucket of the
// ORDER they were produced for, so multiple shifts for the same order/mold accumulate
// into the SAME record. The append-only StockLedgerEntry is the immutable audit trail
// behind every change here.
//
// Each row carries its mold identity (moldName/cavity) and a per-order `requiredQuantity`
// target (= the order's OrderMold.requiredShots × cavity). The Component Store splits a
// row into Pending / Finished / Surplus by comparing quantityOnHand against
// requiredQuantity:
//   Pending  → requiredQuantity is 0 OR quantityOnHand < requiredQuantity
//   Finished → requiredQuantity > 0 AND quantityOnHand >= requiredQuantity
//   Surplus  → the overage beyond requiredQuantity (max(0, onHand − required))
// (status/surplus are derived at read time so they never go stale.)
//
// Hierarchy this powers: Customer → Product → OrderID → Mold/Part → quantityOnHand.
const componentStockItemSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    moldName: { type: String, required: true, trim: true, default: '' },
    partName: { type: String, required: true, trim: true },
    cavity: { type: Number, required: true, default: 1, min: 1 },
    requiredQuantity: { type: Number, required: true, default: 0, min: 0 },
    quantityOnHand: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// The accumulation key — also makes the stock-IN/OUT upsert atomic/idempotent.
// (Replaces the legacy product-level key; the migration drops the old index.)
componentStockItemSchema.index(
  { customerId: 1, productId: 1, orderId: 1, partName: 1 },
  { unique: true }
);
// Drives the per-order availability view (Assembly screen) and the order Component Store.
componentStockItemSchema.index({ customerId: 1, productId: 1, orderId: 1 });
// Drives the product-level aggregate view (Customer Portal / cross-order rollups).
componentStockItemSchema.index({ customerId: 1, productId: 1 });

module.exports = mongoose.model('ComponentStockItem', componentStockItemSchema);
