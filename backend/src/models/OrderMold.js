'use strict';

const mongoose = require('mongoose');

// ordermolds — per-order Mould Setup (revised workflow).
//
// The Moulding Engineer defines the molds an order will run BEFORE/while producing.
// Each mold carries its Cavity and the order's Required Shots target — together these
// drive the production math (Good = Shots × Cavity − Rejected) and the per-order
// Component Store Required Quantity (= requiredShots × cavity).
//
// This is distinct from MoldDefinition: MoldDefinition is the product-level *memory*
// that powers dropdown suggestions (Mold Name → Part → Cavity) across all orders and
// is reinforced on every setup; OrderMold is the concrete, editable setup for ONE
// order. Saving an OrderMold also upserts the MoldDefinition so future orders surface
// the same mold/part/cavity as suggestions.
const orderMoldSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    moldName: { type: String, required: true, trim: true },
    partName: { type: String, required: true, trim: true },
    cavity: { type: Number, required: true, default: 1, min: 1 },
    requiredShots: { type: Number, required: true, default: 0, min: 0 },
    // Concurrency-safe enforcement counter: total shots pushed against THIS (order, mould)
    // target. Guarded-incremented on production submit so simultaneous submissions can never
    // exceed requiredShots; recomputed from records on edit/delete (records stay the source
    // of truth for store/reconcile — this is purely a guard).
    completedShots: { type: Number, required: true, default: 0, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// One setup row per (order, mold). Also makes the define/edit upsert atomic + idempotent.
orderMoldSchema.index({ orderId: 1, moldName: 1 }, { unique: true });
orderMoldSchema.index({ productId: 1 });

module.exports = mongoose.model('OrderMold', orderMoldSchema);
