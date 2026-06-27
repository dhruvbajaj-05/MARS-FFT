'use strict';

const mongoose = require('mongoose');

// mouldingrecords — Module 1, created by Moulding Engineer.
// Revised: rejection is now recorded in SHOTS (not pieces). Good pieces are computed as
//   goodParts = (shotsDone − rejectedShots) × cavity
// rejectionReasons is now a multi-select array of defect labels.
// Records are editable/deletable within 12 hours of creation (enforced by service).
const mouldingRecordSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },

    moldName: { type: String, required: true, trim: true },
    partName: { type: String, required: true, trim: true },
    machineNumber: { type: String, required: true, trim: true },
    shift: { type: String, enum: ['A', 'B', 'C'], required: true },

    cavity: { type: Number, required: true, min: 1, default: 1 },
    shotsDone: { type: Number, required: true, min: 0, default: 0 },
    rejectedShots: { type: Number, min: 0, default: 0 },
    productionQuantity: { type: Number, required: true, min: 0 },
    goodParts: { type: Number, required: true, min: 0 },

    // Multi-select defect labels (replaces single rejectionReason string).
    rejectionReasons: [{ type: String, trim: true }],
    // Legacy single-string field — populated on old records, null on new ones.
    rejectionReason: { type: String, trim: true, default: null },

    comments: { type: String, trim: true },
    imageId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

mouldingRecordSchema.index({ customerId: 1 });
mouldingRecordSchema.index({ orderId: 1 });
mouldingRecordSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('MouldingRecord', mouldingRecordSchema);
