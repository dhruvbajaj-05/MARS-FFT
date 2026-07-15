'use strict';

const mongoose = require('mongoose');

// qcdefecttypes — the shared defect vocabulary for the QC module. Seeded with common
// defaults and grown whenever any engineer taps "+ Add New Defect", so the new defect is
// permanently available across every company, product, order and future QC report
// (both Moulding QC and Assembly QC). Mirrors the RejectionReason pattern, but kept
// separate so QC's taxonomy stays decoupled from moulding production reject reasons.
const qcDefectTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Case-insensitive uniqueness so "Flash" and "flash" don't both get remembered.
qcDefectTypeSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

// The default defect palette (spec §Defect Types).
qcDefectTypeSchema.statics.DEFAULTS = [
  'Flash',
  'Half Shot',
  'Ejector Pin Mark',
  'Pin Oil Mark',
  'Black Spot / Contamination',
  'Shrinkage',
  'Warpage',
  'Burn Mark',
  'Silver Mark',
  'Color Variation',
];

module.exports = mongoose.model('QCDefectType', qcDefectTypeSchema);
