'use strict';

const mongoose = require('mongoose');

// revokedtokens — server-side denylist supporting logout for stateless JWTs.
// When a user logs out, their token's unique id (jti) is stored here until the
// token would naturally expire. A TTL index purges entries automatically at
// `expiresAt`, so the collection never grows unbounded.
const revokedTokenSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// TTL index: documents are removed once `expiresAt` passes.
revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RevokedToken', revokedTokenSchema);
