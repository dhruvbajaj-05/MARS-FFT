'use strict';

const mongoose = require('mongoose');

// mediaassets — uploaded images & invoice documents (doc 08 §10).
// Binaries live in file storage; only a reference/URL is stored here.
const mediaAssetSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['image', 'invoice'], required: true },
    url: { type: String, required: true },
    mimeType: { type: String },
    sizeBytes: { type: Number, min: 0 },
    ownerType: {
      type: String,
      enum: ['moulding', 'assembly', 'qc', 'packing_dispatch'],
      required: true,
    },
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

mediaAssetSchema.index({ ownerType: 1, ownerId: 1 });

module.exports = mongoose.model('MediaAsset', mediaAssetSchema);
