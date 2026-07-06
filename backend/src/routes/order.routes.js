'use strict';

const express = require('express');
const orderController = require('../controllers/order.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { ROLES, ENGINEER_ROLES } = require('../utils/roles');

const router = express.Router();

// Create — admin only. An order belongs to a product (and its customer).
router.post(
  '/',
  ...protect(ROLES.ADMIN),
  requireBody(['customerId', 'productId', 'orderQuantity']),
  orderController.create
);

// List — admin + engineers (cascading dropdown; filter with ?productId= / ?customerId=).
router.get('/', ...protect(ROLES.ADMIN, ...ENGINEER_ROLES), orderController.list);

// Get one — admin + engineers (engineer reads orderQuantity to auto-fill screens).
router.get(
  '/:id',
  ...protect(ROLES.ADMIN, ...ENGINEER_ROLES),
  validateObjectId('id'),
  orderController.getById
);

// Workspace transitions — admin only. Active → Completed (per phase). These flip the
// order's workspace flags so its data moves to history while staying queryable by OrderID.
router.post(
  '/:id/complete-production',
  ...protect(ROLES.ADMIN),
  validateObjectId('id'),
  orderController.completeProduction
);
router.post(
  '/:id/complete-assembly',
  ...protect(ROLES.ADMIN),
  validateObjectId('id'),
  orderController.completeAssembly
);

// Edit / hard-delete — admin only. Delete is blocked while production records exist.
router.patch('/:id', ...protect(ROLES.ADMIN), validateObjectId('id'), orderController.update);
router.delete('/:id', ...protect(ROLES.ADMIN), validateObjectId('id'), orderController.remove);

module.exports = router;
