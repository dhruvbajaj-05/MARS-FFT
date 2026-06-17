'use strict';

const mongoose = require('mongoose');

// surplusstockitems — PRODUCT-LEVEL Surplus store (revised: surplus is a separate area).
//
// Surplus is the moulding production that lands BEYOND an order's Required Quantity
// target. It is intentionally NOT kept inside the order's Pending/Finished cell
// (componentstockitems): assembly consumes the order cell, and surplus must never be
// consumed by assembly. Instead the overage is split off at moulding stock-IN time and
// accumulated here, grouped by:
//   Customer → Product → Part Name
//
// Surplus is NOT separated by OrderID — every completed/over-produced order for the same
// product+part adds into the SAME cell (FFT-00001 Big Block +500, FFT-00002 +300 ⇒ 800).
const surplusStockItemSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    moldName: { type: String, trim: true, default: '' },
    partName: { type: String, required: true, trim: true },
    cavity: { type: Number, default: 1, min: 1 },
    quantityOnHand: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// Accumulation key — product + part (NOT order). Makes the surplus stock-IN upsert
// atomic/idempotent and guarantees one surplus cell per (customer, product, part).
surplusStockItemSchema.index({ customerId: 1, productId: 1, partName: 1 }, { unique: true });
surplusStockItemSchema.index({ customerId: 1, productId: 1 });

module.exports = mongoose.model('SurplusStockItem', surplusStockItemSchema);
