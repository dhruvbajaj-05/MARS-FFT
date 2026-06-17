'use strict';

const mongoose = require('mongoose');

// mouldingrecords — Module 1, created by Moulding Engineer (doc 08 §6).
// Insert-only / immutable in V1 (enforced by the service layer in a later phase).
const mouldingRecordSchema = new mongoose.Schema(
  {
    // Links (from dropdown selection — confirmed FKs).
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },

    // Department fields.
    // moldName + partName drive the Phase 1 Mold Learning system. On submit the
    // (product, mold) pair is learned and partName seeds/overrides the auto-filled
    // default (see mold.service.learnMold). partName is per-record: an engineer may
    // override the learned default without changing it.
    moldName: { type: String, required: true, trim: true },
    partName: { type: String, required: true, trim: true },
    machineNumber: { type: String, required: true, trim: true },
    shift: { type: String, enum: ['A', 'B', 'C'], required: true },
    // Updated workflow: the engineer enters Shots Done; the cavity is auto-filled from
    // the selected mold. The system computes:
    //   productionQuantity (total pieces) = shotsDone × cavity
    //   goodParts                         = productionQuantity − rejectedParts
    // shotsDone/cavity are persisted so the production logbook can reproduce the math.
    cavity: { type: Number, required: true, min: 1, default: 1 },
    shotsDone: { type: Number, required: true, min: 0, default: 0 },
    productionQuantity: { type: Number, required: true, min: 0 },
    goodParts: { type: Number, required: true, min: 0 },
    rejectedParts: { type: Number, required: true, min: 0 },
    rejectionReason: { type: String, trim: true }, // FFT-only
    comments: { type: String, trim: true }, // FFT-only
    imageId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

mouldingRecordSchema.index({ customerId: 1 });
mouldingRecordSchema.index({ orderId: 1 });
mouldingRecordSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('MouldingRecord', mouldingRecordSchema);
