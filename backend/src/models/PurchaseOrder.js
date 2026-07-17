'use strict';

const mongoose = require('mongoose');

// purchaseorders — the container the factory actually works from. A single Purchase Order
// belongs to one Customer (company) and groups several INDEPENDENT production jobs, one per
// Item Code. Each job is a normal `Order` document that carries its own production / store /
// QC state and references this PO via `purchaseOrderId` — so the entire proven reconcile,
// store and computeOrderStatus engine keeps working unchanged, keyed on the job (orderId).
//
//   Customer → PurchaseOrder (PO-#####) → Order[itemCode job] × N
//
// The PO itself stores no quantities; those live on each job (Order.orderQuantity). The PO's
// lifecycle is derived from its jobs (Open until every job is Completed) but cached here for
// cheap listing/filtering.
const STATUSES = ['Open', 'Completed', 'Archived'];

const purchaseOrderSchema = new mongoose.Schema(
  {
    // Human-readable, sequential, unique PO number (PO-00001). Minted by the service via the
    // Counter sequence on create. Not `required` at the schema level because it is assigned
    // immediately after the Counter increment; the unique index still guarantees no dupes.
    poNumber: { type: String, trim: true, default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    status: { type: String, enum: STATUSES, required: true, default: 'Open' },
    notes: { type: String, trim: true },
    completedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

purchaseOrderSchema.index({ poNumber: 1 }, { unique: true, sparse: true });
purchaseOrderSchema.index({ customerId: 1 });
purchaseOrderSchema.index({ status: 1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
module.exports.STATUSES = STATUSES;
