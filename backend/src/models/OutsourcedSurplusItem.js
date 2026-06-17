'use strict';

const mongoose = require('mongoose');

// outsourcedsurplusitems — PRODUCT-LEVEL surplus for outsourced components, mirroring the
// moulded-part Surplus store (see SurplusStockItem). Pooled across orders per
// (customer, product, component); never scoped by OrderID and never mixed with the
// order-scoped outsourced cells. Managed by Moulding Engineers only.
const outsourcedSurplusItemSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    componentName: { type: String, required: true, trim: true },
    quantityOnHand: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

outsourcedSurplusItemSchema.index({ customerId: 1, productId: 1, componentName: 1 }, { unique: true });
outsourcedSurplusItemSchema.index({ customerId: 1, productId: 1 });

module.exports = mongoose.model('OutsourcedSurplusItem', outsourcedSurplusItemSchema);
