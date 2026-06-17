'use strict';

// A typed error carrying an HTTP status + machine-readable code, so controllers
// can `throw new HttpError(...)` and the central errorHandler renders it as
// the consistent JSON shape { error, message } described in doc 09.
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

// Small factory helpers for the common cases.
const badRequest = (msg, code = 'bad_request') => new HttpError(400, code, msg);
const unauthorized = (msg = 'Authentication required', code = 'unauthorized') =>
  new HttpError(401, code, msg);
const forbidden = (msg = 'You are not allowed to perform this action', code = 'forbidden') =>
  new HttpError(403, code, msg);
const notFound = (msg = 'Resource not found', code = 'not_found') =>
  new HttpError(404, code, msg);
const conflict = (msg, code = 'conflict') => new HttpError(409, code, msg);

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict };
