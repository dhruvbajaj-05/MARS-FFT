'use strict';

const express = require('express');
const userController = require('../controllers/user.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// User management is admin-only across the board.

// Create a user account (no public signup in V1).
router.post(
  '/',
  ...protect(ROLES.ADMIN),
  requireBody(['name', 'email', 'password', 'role']),
  userController.create
);

// List users — ?role=&isActive=&page=&limit=
router.get('/', ...protect(ROLES.ADMIN), userController.list);

// Get one.
router.get('/:id', ...protect(ROLES.ADMIN), validateObjectId('id'), userController.getById);

// Soft-deactivate / reactivate (V1 has no hard delete — accounts are deactivated).
router.post(
  '/:id/deactivate',
  ...protect(ROLES.ADMIN),
  validateObjectId('id'),
  userController.deactivate
);
router.post(
  '/:id/reactivate',
  ...protect(ROLES.ADMIN),
  validateObjectId('id'),
  userController.reactivate
);

module.exports = router;
