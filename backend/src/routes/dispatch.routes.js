'use strict';

const express = require('express');
const dispatchController = require('../controllers/dispatch.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { mediaFields } = require('../middleware/upload');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// Phase 5 re-anchor: Dispatch is keyed on Customer + Product; orderId is optional.
const REQUIRED_FIELDS = [
  'productId', 'customerId',
  'dispatchDate', 'packedQuantity', 'cartonCount',
  'transporterName', 'vehicleNumber', 'lrNumber', 'invoiceNumber',
];

// Create a dispatch record — dispatch engineer only.
// `mediaFields` (multipart) parses photos[] (images) + documents[] (PDF/scans)
// and runs before requireBody so text fields are available.
router.post(
  '/',
  ...protect(ROLES.PACKING_DISPATCH_ENGINEER),
  mediaFields('dispatch', [
    { name: 'photos', kind: 'image' },
    { name: 'documents', kind: 'document' },
  ]),
  requireBody(REQUIRED_FIELDS),
  dispatchController.create
);

// This engineer's own records — dispatch engineer only.
router.get('/mine', ...protect(ROLES.PACKING_DISPATCH_ENGINEER), dispatchController.listMine);

// Computed dispatch status for an order — admin + dispatch engineer.
router.get(
  '/status',
  ...protect(ROLES.ADMIN, ROLES.PACKING_DISPATCH_ENGINEER),
  dispatchController.status
);

// Read-all across customers/orders — admin only.
router.get('/', ...protect(ROLES.ADMIN), dispatchController.listAll);

// Get one — admin (any) or dispatch engineer (own, enforced in the service).
router.get(
  '/:id',
  ...protect(ROLES.ADMIN, ROLES.PACKING_DISPATCH_ENGINEER),
  validateObjectId('id'),
  dispatchController.getById
);

// Edit / delete one — dispatch engineer (own, within the 12h window; enforced in the service).
router.patch(
  '/:id',
  ...protect(ROLES.PACKING_DISPATCH_ENGINEER),
  validateObjectId('id'),
  dispatchController.update
);
router.delete(
  '/:id',
  ...protect(ROLES.PACKING_DISPATCH_ENGINEER),
  validateObjectId('id'),
  dispatchController.remove
);

module.exports = router;
