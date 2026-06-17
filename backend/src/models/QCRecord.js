'use strict';

const mongoose = require('mongoose');

// Embedded defect line — one per defect type found during the inspection.
const defectSchema = new mongoose.Schema(
  {
    defectType: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    remarks: { type: String, trim: true },
  },
  { _id: false }
);

// qcrecords — Module 3, created by QC Engineer (Phase 6).
// Insert-only / immutable in V1 (no update or delete is ever performed by app code).
// Field set per the Phase 6 spec; consumes Assembly good output (see qc.service).
const qcRecordSchema = new mongoose.Schema(
  {
    // Phase 4 re-anchor: QC inspects assembled output by Customer + Product and feeds
    // the Finished Goods Store. orderId is OPTIONAL (kept for traceability when tagged).
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },

    // Inspection fields.
    inspectionDate: { type: Date, required: true },
    inspectionType: { type: String, required: true, trim: true },
    sampleSize: { type: Number, required: true, min: 0 }, // units inspected (flows from assembly good output)
    acceptedQuantity: { type: Number, required: true, min: 0 },
    rejectedQuantity: { type: Number, required: true, min: 0 },
    defectCount: { type: Number, required: true, min: 0 },
    defects: { type: [defectSchema], default: [] },
    correctiveAction: { type: String, trim: true },
    remarks: { type: String, trim: true },

    // Multiple images allowed ("photos[]").
    photos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' }],

    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  // Both timestamps per the Phase 6 field list; updatedAt stays equal to createdAt
  // in V1 since records are never edited.
  { timestamps: { createdAt: true, updatedAt: true } }
);

qcRecordSchema.index({ customerId: 1 });
qcRecordSchema.index({ orderId: 1 });
qcRecordSchema.index({ orderId: 1, inspectionDate: -1 }); // Daily QC Report
qcRecordSchema.index({ submittedBy: 1, createdAt: -1 });

module.exports = mongoose.model('QCRecord', qcRecordSchema);
