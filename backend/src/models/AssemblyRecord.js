'use strict';

const mongoose = require('mongoose');

// assemblyrecords — Module 2, created by Assembly Engineer (Phase 5).
// Insert-only / immutable in V1 (no update or delete is ever performed by app code).
// Field set per the Phase 5 spec; consumes moulding output (see assembly.service).
const assemblyRecordSchema = new mongoose.Schema(
  {
    // Phase 3 re-anchor: Assembly is store-driven, keyed on Customer + Product. An
    // order may span many production runs and one product accumulates across orders,
    // so orderId is now OPTIONAL (kept for traceability when the engineer tags one).
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },

    // Department fields.
    assemblyLine: { type: String, required: true, trim: true },
    operatorCount: { type: Number, required: true, min: 0 },
    shift: { type: String, enum: ['A', 'B', 'C'], required: true },
    // Optional in the store-driven model (no per-order moulding cap). When omitted it
    // is not enforced.
    inputQuantity: { type: Number, min: 0, default: 0 },
    // Updated workflow: the engineer enters Assembled Sets; the system multiplies by the
    // product's assortment (parts-per-set) to consume finished components from the
    // Component Store. assembledQuantity mirrors assembledSets (kept for analytics
    // back-compat). `consumption` snapshots exactly what was deducted, per part.
    assembledSets: { type: Number, required: true, min: 0, default: 0 },
    // Extra sets produced from SURPLUS inventory AFTER the order's required sets are met.
    // These do not count toward the order quantity and consume the surplus pools, not the
    // order's component cells. `fromSurplus` flags such records so they are kept separate.
    extraSets: { type: Number, min: 0, default: 0 },
    fromSurplus: { type: Boolean, default: false },
    consumption: [
      {
        _id: false,
        partName: { type: String, required: true, trim: true },
        perSet: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 0 },
        // 'moulded' → from moulding Component Store / moulded Surplus;
        // 'outsourced' → from the Outsourced Components store / outsourced Surplus.
        kind: { type: String, enum: ['moulded', 'outsourced'], default: 'moulded' },
      },
    ],
    assembledQuantity: { type: Number, required: true, min: 0 },
    rejectedQuantity: { type: Number, required: true, min: 0 },
    rejectionReason: { type: String, trim: true }, // FFT-only
    remarks: { type: String, trim: true }, // FFT-only

    // Multiple images allowed ("photos[]").
    photos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' }],

    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  // Both timestamps per the Phase 5 field list; updatedAt stays equal to createdAt
  // in V1 since records are never edited.
  { timestamps: { createdAt: true, updatedAt: true } }
);

assemblyRecordSchema.index({ customerId: 1 });
assemblyRecordSchema.index({ orderId: 1 });
assemblyRecordSchema.index({ productId: 1 });
assemblyRecordSchema.index({ submittedBy: 1, createdAt: -1 });

module.exports = mongoose.model('AssemblyRecord', assemblyRecordSchema);
