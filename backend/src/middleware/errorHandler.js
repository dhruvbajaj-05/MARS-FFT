'use strict';

const { HttpError } = require('../utils/httpError');
const env = require('../config/env');

// 404 for any unmatched route.
function notFoundHandler(req, res, next) {
  res.status(404).json({ error: 'not_found', message: `Route ${req.method} ${req.originalUrl} not found` });
}

// Central error handler — renders the consistent { error, message } shape (doc 09).
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Known, intentional errors.
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }

  // Mongoose validation errors → 400.
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'validation_error', message: err.message });
  }

  // Duplicate key (e.g., email already exists) → 409.
  if (err.code === 11000) {
    return res.status(409).json({ error: 'duplicate_key', message: 'Resource already exists' });
  }

  // Anything else → 500 (hide internals in production).
  console.error('[error]', err);
  return res.status(500).json({
    error: 'server_error',
    message: env.nodeEnv === 'production' ? 'Internal server error' : err.message,
  });
}

module.exports = { notFoundHandler, errorHandler };
