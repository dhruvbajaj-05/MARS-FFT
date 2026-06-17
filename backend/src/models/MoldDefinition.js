'use strict';

const mongoose = require('mongoose');

// molddefinitions — Phase 1 Mold Learning memory.
// The Admin does NOT create molds. A definition is learned automatically the first
// time a Moulding Engineer submits a record naming a (product, mold) pair, and is
// reinforced on every subsequent submission (usageCount / lastUsedAt).
//
// `defaultPartName` is captured on FIRST sighting and never overwritten ("first-wins"):
// it powers the Part Name auto-fill on the moulding screen. Engineers may still type a
// different part on any individual record — that override lives on the MouldingRecord
// and does not change the learned default here.
//
// customerId is denormalized from the product for convenient filtering; the learning
// key is (productId, moldName).
const moldDefinitionSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    moldName: { type: String, required: true, trim: true },
    defaultPartName: { type: String, required: true, trim: true },
    // Updated workflow: a mold is now explicitly defined by the Moulding Engineer and
    // carries the cavity count and the per-order Required Shots target. cavity drives
    // the production math (Good = Shots × Cavity − Rejected) and, with requiredShots,
    // the Component Store's Required Quantity (= requiredShots × cavity).
    cavity: { type: Number, required: true, default: 1, min: 1 },
    requiredShots: { type: Number, required: true, default: 0, min: 0 },
    usageCount: { type: Number, default: 0, min: 0 },
    lastUsedAt: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One learned definition per (product, mold). The unique index also makes the
// learn-on-submit upsert atomic and idempotent under concurrency.
moldDefinitionSchema.index({ productId: 1, moldName: 1 }, { unique: true });
// Drives the dropdown query (most-used first).
moldDefinitionSchema.index({ productId: 1, usageCount: -1 });
moldDefinitionSchema.index({ customerId: 1 });

module.exports = mongoose.model('MoldDefinition', moldDefinitionSchema);
