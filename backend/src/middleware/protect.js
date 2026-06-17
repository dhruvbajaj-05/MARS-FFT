'use strict';

const authenticate = require('./auth');
const { allow } = require('./rbac');

// Convenience composition of the two auth middlewares so routes read cleanly.
//   protect()                       → just require a valid (non-revoked) token
//   protect(ROLES.ADMIN)            → token + must be admin
//   protect(ROLES.ADMIN, ROLES.QC)  → token + must be one of these roles
//
// Returns an array of middleware; spread it into the route:
//   router.post('/customers', ...protect(ROLES.ADMIN), controller.create)
function protect(...roles) {
  if (roles.length === 0) {
    return [authenticate];
  }
  return [authenticate, allow(...roles)];
}

module.exports = protect;
