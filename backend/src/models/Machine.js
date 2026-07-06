'use strict';

const mongoose = require('mongoose');

// machines — Machine Master (admin-managed). Moulding Engineers only SELECT from these
// in production entries; they cannot create/edit/delete. Two categories.
const CATEGORIES = ['injection', 'blow'];

const machineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: CATEGORIES, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

machineSchema.index({ name: 1 }, { unique: true });
machineSchema.index({ category: 1 });

module.exports = mongoose.model('Machine', machineSchema);
module.exports.CATEGORIES = CATEGORIES;
