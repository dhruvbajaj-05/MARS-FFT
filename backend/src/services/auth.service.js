'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const { unauthorized } = require('../utils/httpError');

// Build the JWT payload + sign it. Token carries id, role, (for customers) customerId,
// and a unique token id `jti` so individual tokens can be revoked on logout.
function issueToken(user) {
  const payload = {
    sub: user._id.toString(),
    role: user.role,
    customerId: user.customerId ? user.customerId.toString() : null,
    jti: crypto.randomUUID(),
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiry });
}

// Shape a user document for safe return to the client (never expose passwordHash).
function toPublicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    customerId: user.customerId ? user.customerId.toString() : null,
  };
}

// Hash a plain password (used by the seed script / future user provisioning).
async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

// Verify credentials and return { token, user }.
async function login(email, password) {
  const user = await User.findOne({ email: String(email).toLowerCase().trim() });

  // Same generic message whether the email or the password is wrong (avoid leaking which).
  if (!user || !user.isActive) {
    throw unauthorized('Invalid email or password', 'invalid_credentials');
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw unauthorized('Invalid email or password', 'invalid_credentials');
  }

  return { token: issueToken(user), user: toPublicUser(user) };
}

// Issue a fresh token for an already-authenticated user (refresh).
async function refresh(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw unauthorized('Account no longer active', 'inactive_account');
  }
  return { token: issueToken(user), user: toPublicUser(user) };
}

// Load the current user's public profile.
async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw unauthorized('User not found', 'user_not_found');
  }
  return toPublicUser(user);
}

// Logout: add the current token's `jti` to the denylist until it would expire.
// `exp` is the JWT expiry in seconds (from the verified payload).
async function logout({ jti, exp, userId }) {
  if (!jti || !exp) {
    // Token has no jti/exp to revoke (shouldn't happen for tokens we issue).
    // Logout is still considered successful — the client discards the token.
    return;
  }
  const expiresAt = new Date(exp * 1000);
  await RevokedToken.updateOne(
    { jti },
    { $setOnInsert: { jti, userId, expiresAt } },
    { upsert: true }
  );
}

// True if a token's `jti` has been revoked (used by the auth middleware).
async function isRevoked(jti) {
  if (!jti) return false;
  const found = await RevokedToken.exists({ jti });
  return Boolean(found);
}

module.exports = {
  login,
  refresh,
  getProfile,
  logout,
  isRevoked,
  issueToken,
  toPublicUser,
  hashPassword,
};
