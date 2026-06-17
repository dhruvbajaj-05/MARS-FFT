'use strict';

const mongoose = require('mongoose');

// packingdispatchrecords — Module 4, created by Packing & Dispatch Engineer (Phase 7).
// Insert-only / immutable in V1 (no update or delete is ever performed by app code).
// Field set per the Phase 7 spec; consumes QC approved quantity (see dispatch.service).
const packingDispatchRecordSchema = new mongoose.Schema(
  {
    // Phase 5 re-anchor: Dispatch ships from the Finished Goods Store by Customer +
    // Product. orderId is OPTIONAL (kept for traceability when the engineer tags one).
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },

    // Dispatch fields.
    dispatchDate: { type: Date, required: true },
    packedQuantity: { type: Number, required: true, min: 0 }, // flows from QC approved qty
    cartonCount: { type: Number, required: true, min: 0 },
    transporterName: { type: String, required: true, trim: true },
    vehicleNumber: { type: String, required: true, trim: true },
    lrNumber: { type: String, required: true, trim: true },
    invoiceNumber: { type: String, required: true, trim: true },
    dispatchRemarks: { type: String, trim: true },

    // Uploads: images (type 'image') and documents (type 'invoice') in mediaassets.
    photos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' }],
    documents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' }],

    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  // Both timestamps per the Phase 7 field list; updatedAt stays equal to createdAt
  // in V1 since records are never edited.
  { timestamps: { createdAt: true, updatedAt: true } }
);

packingDispatchRecordSchema.index({ customerId: 1 });
packingDispatchRecordSchema.index({ orderId: 1 });
packingDispatchRecordSchema.index({ productId: 1 });
packingDispatchRecordSchema.index({ submittedBy: 1, createdAt: -1 });

module.exports = mongoose.model('PackingDispatchRecord', packingDispatchRecordSchema);
