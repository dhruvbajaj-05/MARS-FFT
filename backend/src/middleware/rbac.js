'use strict';

const { forbidden, unauthorized } = require('../utils/httpError');

// Role-based access guard. Use AFTER `authenticate` so req.user is set.
// Example: router.post('/customers', authenticate, allow(ROLES.ADMIN), handler)
function allow(...allowedRoles) {
  return function rbacGuard(req, res, next) {
    if (!req.user) {
      return next(unauthorized());
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(forbidden(`Role "${req.user.role}" is not permitted on this route`));
    }
    return next();
  };
}

module.exports = { allow };
