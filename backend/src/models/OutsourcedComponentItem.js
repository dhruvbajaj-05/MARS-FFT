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
const outsourcedComponentItemSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    componentName: { type: String, required: true, trim: true },
    quantityOnHand: { type: Number, required: true, default: 0, min: 0 },
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
