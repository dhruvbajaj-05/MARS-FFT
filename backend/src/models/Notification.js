'use strict';

const mongoose = require('mongoose');

// notifications — customer event notifications (doc 08 §11).
// channel defaults to 'in_app' for V1 (push/SMS/email is Q-N1).
const notificationSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    eventType: {
      type: String,
      enum: [
        'production_starts',
        'production_completes',
        'qc_completes',
        'dispatch_scheduled',
        'goods_dispatched',
      ],
      required: true,
    },
    message: { type: String, required: true },
    channel: { type: String, default: 'in_app' },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ customerId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
