'use strict';

const mongoose = require('mongoose');
const { badRequest } = require('../utils/httpError');

// Lightweight, dependency-free request validation (doc 10 `middleware/validate.js`).
// `requireBody([...fields])` ensures the listed fields are present and non-empty
// in req.body. Heavier field-by-field validation can be added per route later.
function requireBody(fields) {
  return function validateBody(req, res, next) {
    const body = req.body || {};
    const missing = fields.filter((f) => {
      const v = body[f];
      return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    });

    if (missing.length > 0) {
      return next(
        badRequest(`Missing required field(s): ${missing.join(', ')}`, 'missing_fields')
      );
    }
    return next();
  };
}

// Ensures a route param is a syntactically valid Mongo ObjectId, so a malformed
// `:id` yields a clean 400 instead of a CastError surfacing as a 500.
function validateObjectId(param = 'id') {
  return function validateId(req, res, next) {
    const value = req.params[param];
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return next(badRequest(`Invalid ${param}: "${value}" is not a valid id`, 'invalid_id'));
    }
    return next();
  };
}

module.exports = { requireBody, validateObjectId };
