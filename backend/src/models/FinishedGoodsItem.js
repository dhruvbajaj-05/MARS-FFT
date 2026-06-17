'use strict';

const mongoose = require('mongoose');

// finishedgoodsitems — Phase 4 Finished Goods Store balance table.
// One materialized balance per (customer, product). QC approval increments
// `quantityOnHand` (stock-IN); Dispatch decrements it (stock-OUT). Finished goods
// are whole products, so there is no part dimension here.
//
// Hierarchy this powers: Customer → Product → quantityOnHand.
const finishedGoodsItemSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantityOnHand: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// The accumulation key — also makes the stock-IN/OUT updates atomic/idempotent.
finishedGoodsItemSchema.index({ customerId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('FinishedGoodsItem', finishedGoodsItemSchema);
