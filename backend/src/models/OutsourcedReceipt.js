'use strict';

const mongoose = require('mongoose');

// outsourcedreceipts — immutable, transaction-based record of outsourced stock RECEIVED for
// an order (purchased/external parts: sticker, screw, spring, battery…). This is the SOURCE
// OF TRUTH for outsourced inventory, mirroring MouldingRecord for moulded parts.
//
// The order/surplus balance caches (OutsourcedComponentItem / OutsourcedSurplusItem) are
// fully re-derived from these receipts by reconcile.service on every create / edit / delete,
// so inventory can never drift: deleting or editing a receipt recalculates everything.
//
// Allocation is NOT stored here — it is derived at reconcile time (receipts fill the order's
// requirement first, the remainder rolls into product-level surplus; earlier orders draw
// existing surplus before any procurement is needed).
const outsourcedReceiptSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    componentName: { type: String, required: true, trim: true },
    quantityReceived: { type: Number, required: true, min: 0 },
    // perSet at the time of receipt — informational; the authoritative per-order requirement
    // lives on the OutsourcedComponentItem snapshot. Kept so a receipt can also set/refresh
    // the snapshot when the engineer supplies a per-set value.
    perSet: { type: Number, default: 0, min: 0 },
    remarks: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// Drives the per-order receipt list and the reconcile aggregation.
outsourcedReceiptSchema.index({ customerId: 1, productId: 1, orderId: 1, componentName: 1 });
outsourcedReceiptSchema.index({ customerId: 1, productId: 1 });
outsourcedReceiptSchema.index({ orderId: 1, createdAt: -1 });

module.exports = mongoose.model('OutsourcedReceipt', outsourcedReceiptSchema);
