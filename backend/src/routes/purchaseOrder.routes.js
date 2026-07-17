'use strict';

const express = require('express');
const purchaseOrderController = require('../controllers/purchaseOrder.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { ROLES, ENGINEER_ROLES } = require('../utils/roles');

const router = express.Router();

// Create a PO with one or more Item Code lines — admin only.
router.post(
  '/',
  ...protect(ROLES.ADMIN),
  requireBody(['customerId', 'lines']),
  purchaseOrderController.create
);

// List + get — admin + engineers (engineers drive the Company → PO → Item Code cascade).
router.get('/', ...protect(ROLES.ADMIN, ...ENGINEER_ROLES), purchaseOrderController.list);
router.get(
  '/:id',
  ...protect(ROLES.ADMIN, ...ENGINEER_ROLES),
  validateObjectId('id'),
  purchaseOrderController.getById
);

// Line management — admin only.
router.post(
  '/:id/lines',
  ...protect(ROLES.ADMIN),
  validateObjectId('id'),
  requireBody(['productId', 'orderQuantity']),
  purchaseOrderController.addLine
);
router.delete(
  '/:id/lines/:jobId',
  ...protect(ROLES.ADMIN),
  validateObjectId('id'),
  validateObjectId('jobId'),
  purchaseOrderController.removeLine
);

// Edit / delete the PO — admin only.
router.patch('/:id', ...protect(ROLES.ADMIN), validateObjectId('id'), purchaseOrderController.update);
router.delete('/:id', ...protect(ROLES.ADMIN), validateObjectId('id'), purchaseOrderController.remove);

module.exports = router;
