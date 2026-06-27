'use strict';

const mongoose = require('mongoose');

// stockledgerentries — Phase 2 append-only audit trail for BOTH stores.
// Every balance change in componentstockitems / finishedgoodsitems is backed by an
// immutable ledger row here. Insert-only (never updated or deleted), consistent with
// the V1 "permanent record" rule. The balance tables are a materialized rollup of
// these entries; the ledger is the source of truth for history and reconciliation.
//
//   storeType        COMPONENT      → moulding parts inventory (has partName)
//                    SURPLUS        → product-level over-production (has partName, no order)
//                    FINISHED_GOODS → approved whole products (partName is null)
//   transactionType  IN  → production/approval adds stock
//                    OUT → dispatch (and, later, BOM assembly consumption) removes stock
//   sourceModule     which department/action produced the movement
//   referenceId      the source record (mouldingrecord / qcrecord / packingdispatchrecord)
const STORE_TYPES = ['COMPONENT', 'SURPLUS', 'FINISHED_GOODS'];
const TRANSACTION_TYPES = ['IN', 'OUT'];
const SOURCE_MODULES = [
  'moulding', 'assembly', 'qc', 'dispatch', 'adjustment',
  'moulding_recovery', 'moulding_edit', 'moulding_delete', 'order_surplus_consumption',
];

const stockLedgerEntrySchema = new mongoose.Schema(
  {
    storeType: { type: String, enum: STORE_TYPES, required: true },
    transactionType: { type: String, enum: TRANSACTION_TYPES, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    // Order this movement belongs to. Set for order-scoped COMPONENT movements
    // (moulding IN, assembly OUT); null for FINISHED_GOODS movements (product-level).
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    // null for FINISHED_GOODS entries (whole products have no part).
    partName: { type: String, trim: true, default: null },
    quantity: { type: Number, required: true, min: 1 },
    sourceModule: { type: String, enum: SOURCE_MODULES, required: true },
    // The originating record (e.g. the MouldingRecord that produced the parts).
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    remarks: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockLedgerEntrySchema.index({ storeType: 1, customerId: 1, productId: 1, createdAt: -1 });
stockLedgerEntrySchema.index({ orderId: 1, createdAt: -1 });
stockLedgerEntrySchema.index({ sourceModule: 1, referenceId: 1 });
stockLedgerEntrySchema.index({ createdAt: -1 });

module.exports = mongoose.model('StockLedgerEntry', stockLedgerEntrySchema);
module.exports.STORE_TYPES = STORE_TYPES;
module.exports.TRANSACTION_TYPES = TRANSACTION_TYPES;
module.exports.SOURCE_MODULES = SOURCE_MODULES;
