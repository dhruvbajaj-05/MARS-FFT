'use strict';

const mongoose = require('mongoose');

// qcreports — centralized Quality Management System (image-first defect reports).
// This is a NEW, separate concern from `qcrecords` (the finished-goods inspection that
// feeds inventory). QC reports are authored by moulding / assembly engineers to replace
// WhatsApp defect photos, and are viewed by Admin (later Customers).
//
// One collection powers both the "Moulding QC" and "Assembly QC" tabs via `department`,
// and stays extensible: future QC types (incoming / final / dispatch) only add a value.

const DEPARTMENTS = ['moulding', 'assembly']; // extensible: 'incoming', 'final', 'dispatch'
const SEVERITIES = ['minor', 'major', 'critical'];
const STATUSES = ['open', 'investigating', 'resolved', 'rejected'];

// A threaded comment (Admin + engineers now; customers read-only later).
const commentSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, trim: true },
    authorRole: { type: String, trim: true },
    text: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// One entry per status transition, so a report carries its full audit trail.
const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    byId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String, trim: true },
    note: { type: String, trim: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const qcReportSchema = new mongoose.Schema(
  {
    department: { type: String, enum: DEPARTMENTS, required: true },

    // Anchored on the manufacturing chain (Company → Product → Order).
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },

    // Context captured by the engineer.
    machine: { type: String, trim: true },
    mould: { type: String, trim: true },
    part: { type: String, trim: true },
    shift: { type: String, enum: ['A', 'B', 'C'] },

    // Defect content.
    defects: [{ type: String, trim: true }],
    severity: { type: String, enum: SEVERITIES, required: true, default: 'minor' },
    description: { type: String, trim: true },
    tags: [{ type: String, trim: true }],

    // Images (binaries on disk; only references here — see MediaAsset).
    photos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' }],

    status: { type: String, enum: STATUSES, required: true, default: 'open' },
    comments: { type: [commentSchema], default: [] },
    statusHistory: { type: [statusHistorySchema], default: [] },

    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    submittedByName: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

qcReportSchema.index({ department: 1, orderId: 1, createdAt: -1 });
qcReportSchema.index({ department: 1, status: 1 });
qcReportSchema.index({ customerId: 1, productId: 1 });
qcReportSchema.index({ submittedBy: 1, createdAt: -1 });
qcReportSchema.index({ machine: 1 });
qcReportSchema.index({ defects: 1 });

module.exports = mongoose.model('QCReport', qcReportSchema);
module.exports.DEPARTMENTS = DEPARTMENTS;
module.exports.SEVERITIES = SEVERITIES;
module.exports.STATUSES = STATUSES;
