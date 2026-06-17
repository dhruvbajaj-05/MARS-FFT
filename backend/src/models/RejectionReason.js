'use strict';

const mongoose = require('mongoose');

// rejectionreasons — remembered moulding rejection reasons. Seeded with common defaults
// and grown whenever an engineer types a new one, so future dropdowns suggest it.
const rejectionReasonSchema = new mongoose.Schema(
  {
    reason: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Case-insensitive uniqueness so "Flash" and "flash" don't both get remembered.
rejectionReasonSchema.index({ reason: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('RejectionReason', rejectionReasonSchema);
