'use strict';

const mongoose = require('mongoose');

// qcnotifications — in-app notifications raised when a QC report is submitted. V1 targets
// the Admin (forRole: 'admin'); the schema already carries customerId / orderId so customer
// notifications can be enabled later by adding forRole: 'customer' rows (no schema change).
const qcNotificationSchema = new mongoose.Schema(
  {
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'QCReport', required: true },
    department: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },

    // Recipient scope. 'admin' now; 'customer' later (customerId already scopes it).
    forRole: { type: String, enum: ['admin', 'customer'], required: true, default: 'admin' },

    message: { type: String, required: true },
    severity: { type: String, default: 'minor' },
    channel: { type: String, default: 'in_app' },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

qcNotificationSchema.index({ forRole: 1, isRead: 1, createdAt: -1 });
qcNotificationSchema.index({ customerId: 1, createdAt: -1 });

module.exports = mongoose.model('QCNotification', qcNotificationSchema);
