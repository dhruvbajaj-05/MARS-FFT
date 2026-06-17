'use strict';

const authService = require('../services/auth.service');

// POST /api/v1/auth/login
// (body validated by validate.requireBody(['email','password']) in the route)
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/refresh  (requires a valid token)
async function refresh(req, res, next) {
  try {
    const result = await authService.refresh(req.user.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/auth/me  (requires a valid token)
async function me(req, res, next) {
  try {
    const user = await authService.getProfile(req.user.id);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/logout  (requires a valid token)
// Revokes the presented token (denylist) so it can no longer be used.
async function logout(req, res, next) {
  try {
    await authService.logout({
      jti: req.user.jti,
      exp: req.user.exp,
      userId: req.user.id,
    });
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, refresh, me, logout };
