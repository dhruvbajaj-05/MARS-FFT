'use strict';

const mongoose = require('mongoose');

// products — Admin-created; Customer 1—* Product (doc 08 §4).
const productSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    name: { type: String, required: true, trim: true },
    // itemCode is the unique manufacturing identifier (e.g. "37500"). Every production
    // process references the item code; `name` is display-only. Globally unique so an item
    // code unambiguously identifies one product across the whole system.
    itemCode: { type: String, required: true, trim: true },
    partName: { type: String, trim: true },
    // Archive/inactive lifecycle. A product with production history is never hard-deleted
    // (that would break historical OrderID tracking) — it is archived instead. Archived
    // products drop out of active dropdowns but stay queryable for history.
    status: { type: String, enum: ['Active', 'Archived'], required: true, default: 'Active' },
    archivedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

productSchema.index({ customerId: 1 });
productSchema.index({ customerId: 1, name: 1 });
// Case-insensitive global uniqueness on the manufacturing item code. PARTIAL so it only
// applies to products that actually carry a string itemCode — this lets the unique index
// build cleanly on databases that still contain legacy products without an itemCode
// (otherwise their many "null" values would collide on a plain unique index).
productSchema.index(
  { itemCode: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    partialFilterExpression: { itemCode: { $type: 'string' } },
  }
);
productSchema.index({ status: 1 });

module.exports = mongoose.model('Product', productSchema);
