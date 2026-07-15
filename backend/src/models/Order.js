'use strict';

const mongoose = require('mongoose');

// orders — Admin-created; Product 1—* Order (doc 08 §5).
// orderQuantity is Admin-set and auto-fills engineer screens.
// Produced/Pending/Progress and the per-department timeline stage are computed at read
// time (Q-P1/Q-T1) and are intentionally NOT stored here.
//
// Revised workflow — Global Order System + lifecycle:
//   orderCode         human-readable, sequential, unique OrderID (FFT-00001). Minted by
//                     the order service via the Counter sequence on create.
//   status            overall lifecycle: Active → Completed → Archived. Active = visible
//                     on working screens; Completed = both phases done (history);
//                     Archived = admin manually retired. NOTHING is ever deleted.
//   productionStatus  Moulding workspace flag. Active until Admin clicks "Complete
//                     Production", then Completed (records become history under the
//                     OrderID but remain queryable).
//   assemblyStatus    Assembly workspace flag, completed via "Complete Assembly".
const LIFECYCLE = ['Active', 'Completed', 'Archived'];
const PHASE = ['Active', 'Completed'];

const orderSchema = new mongoose.Schema(
  {
    // Unique sequential OrderID. Not `required` at the schema level because it is
    // assigned by the service immediately after the Counter increment; the unique index
    // (sparse) still guarantees no duplicates. Legacy orders are backfilled by the
    // migration script.
    orderCode: { type: String, trim: true, default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    orderQuantity: { type: Number, required: true, min: 0 },

    status: { type: String, enum: LIFECYCLE, required: true, default: 'Active' },
    productionStatus: { type: String, enum: PHASE, required: true, default: 'Active' },
    assemblyStatus: { type: String, enum: PHASE, required: true, default: 'Active' },
    productionCompletedAt: { type: Date, default: null },
    assemblyCompletedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },

    // Departments whose QC documentation the engineer has explicitly finished
    // ("Done Uploading QC Photos" — QC module req #11). A closed department drops the
    // order from that department's active QC list, but production completion never
    // closes QC on its own (engineers may keep documenting defects after production).
    qcClosedDepartments: { type: [String], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// Sparse unique so legacy rows (null until migrated) don't collide; once assigned, the
// FFT-##### code is globally unique.
orderSchema.index({ orderCode: 1 }, { unique: true, sparse: true });
orderSchema.index({ customerId: 1 });
orderSchema.index({ productId: 1 });
orderSchema.index({ customerId: 1, productId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ productionStatus: 1 });
orderSchema.index({ assemblyStatus: 1 });

module.exports = mongoose.model('Order', orderSchema);
module.exports.LIFECYCLE = LIFECYCLE;
module.exports.PHASE = PHASE;
