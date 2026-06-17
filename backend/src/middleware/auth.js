'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { unauthorized } = require('../utils/httpError');
const { isRevoked } = require('../services/auth.service');

// Verifies the JWT on the Authorization header, rejects revoked (logged-out)
// tokens, and attaches a clean user object to req.user:
//   { id, role, customerId, jti, exp }
// Used on every protected route (combine with rbac.allow(...) for role checks).
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(unauthorized('Missing or malformed Authorization header'));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);

    // Reject tokens that have been revoked via logout.
    if (await isRevoked(payload.jti)) {
      return next(unauthorized('Token has been revoked', 'token_revoked'));
    }

    req.user = {
      id: payload.sub,
      role: payload.role,
      customerId: payload.customerId || null,
      jti: payload.jti,
      exp: payload.exp,
    };
    return next();
  } catch (err) {
    return next(unauthorized('Invalid or expired token'));
  }
}

module.exports = authenticate;
