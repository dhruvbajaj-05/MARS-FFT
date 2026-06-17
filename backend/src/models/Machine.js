'use strict';

const mongoose = require('mongoose');

// machines — Machine Master (admin-managed). Moulding Engineers only SELECT from these
// in production entries; they cannot create/edit/archive. Two categories.
const CATEGORIES = ['injection', 'blow'];
const STATUS = ['Active', 'Archived'];

const machineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: CATEGORIES, required: true },
    status: { type: String, enum: STATUS, required: true, default: 'Active' },
    archivedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

machineSchema.index({ name: 1 }, { unique: true });
machineSchema.index({ status: 1, category: 1 });

module.exports = mongoose.model('Machine', machineSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.STATUS = STATUS;
