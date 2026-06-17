'use strict';

const mongoose = require('mongoose');

// customers — Admin-created buyer/brand (doc 08 §3).
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

customerSchema.index({ name: 1 });

module.exports = mongoose.model('Customer', customerSchema);
