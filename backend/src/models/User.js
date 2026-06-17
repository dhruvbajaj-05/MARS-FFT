'use strict';

const mongoose = require('mongoose');
const { ALL_ROLES, ROLES } = require('../utils/roles');

// users — accounts + role (doc 08 §2).
// customerId is set ONLY when role === 'customer'.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ALL_ROLES, required: true },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Enforce the rule: a customer user must reference a customer; internal roles must not.
userSchema.pre('validate', function enforceCustomerLink(next) {
  if (this.role === ROLES.CUSTOMER && !this.customerId) {
    return next(new Error('customerId is required when role is "customer"'));
  }
  if (this.role !== ROLES.CUSTOMER && this.customerId) {
    return next(new Error('customerId must be null for non-customer roles'));
  }
  next();
});

userSchema.index({ role: 1 });
userSchema.index({ customerId: 1 });

module.exports = mongoose.model('User', userSchema);
