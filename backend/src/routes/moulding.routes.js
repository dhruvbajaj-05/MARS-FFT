'use strict';

const express = require('express');
const mouldingController = require('../controllers/moulding.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { singleImage } = require('../middleware/upload');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// Required body fields for a new production record.
const REQUIRED_FIELDS = [
  'orderId', 'productId', 'customerId',
  'moldName', 'machineNumber',
  'shotsDone',
];

// Dashboard: companies → products → active order counts (moulding engineer + admin).
// Declared before /:id so "dashboard" is not captured as an id.
router.get(
  '/dashboard',
  ...protect(ROLES.ADMIN, ROLES.MOULDING_ENGINEER),
  mouldingController.dashboard
);

// Create a moulding record (moulding engineer only).
router.post(
  '/',
  ...protect(ROLES.MOULDING_ENGINEER),
  singleImage('moulding', 'image'),
  requireBody(REQUIRED_FIELDS),
  mouldingController.create
);

// All dept records (shared visibility, role-based — moulding engineer only).
router.get('/mine', ...protect(ROLES.MOULDING_ENGINEER), mouldingController.listMine);

// Computed production status for an order.
router.get(
  '/status',
  ...protect(ROLES.ADMIN, ROLES.MOULDING_ENGINEER),
  mouldingController.status
);

// Remembered rejection reasons (multi-select list).
router.get(
  '/rejection-reasons',
  ...protect(ROLES.ADMIN, ROLES.MOULDING_ENGINEER),
  mouldingController.rejectionReasons
);
// Persist a custom defect immediately (before form submission).
router.post(
  '/rejection-reasons',
  ...protect(ROLES.MOULDING_ENGINEER),
  mouldingController.saveRejectionReason
);

// Recover good pieces from rejected shots → product surplus.
router.post(
  '/recover',
  ...protect(ROLES.MOULDING_ENGINEER),
  requireBody(['orderId', 'productId', 'customerId', 'recoveries']),
  mouldingController.recover
);

// Learned molds for a product. Declared before /:id.
router.get(
  '/molds',
  ...protect(ROLES.ADMIN, ROLES.MOULDING_ENGINEER),
  mouldingController.listMolds
);
router.post(
  '/molds',
  ...protect(ROLES.MOULDING_ENGINEER),
  requireBody(['customerId', 'productId', 'moldName', 'partName', 'cavity']),
  mouldingController.createMold
);

// Per-order Mould Setup. Declared before /:id.
router.get(
  '/order-molds',
  ...protect(ROLES.ADMIN, ROLES.MOULDING_ENGINEER),
  mouldingController.listOrderMolds
);
router.post(
  '/order-molds',
  ...protect(ROLES.MOULDING_ENGINEER),
  requireBody(['orderId', 'moldName', 'partName', 'cavity']),
  mouldingController.createOrderMold
);

// Read-all — admin only.
router.get('/', ...protect(ROLES.ADMIN), mouldingController.listAll);

// Get, edit, delete one record — admin (get only) or moulding engineer (own, with 12h window).
router.get(
  '/:id',
  ...protect(ROLES.ADMIN, ROLES.MOULDING_ENGINEER),
  validateObjectId('id'),
  mouldingController.getById
);
router.patch(
  '/:id',
  ...protect(ROLES.MOULDING_ENGINEER),
  validateObjectId('id'),
  mouldingController.update
);
router.delete(
  '/:id',
  ...protect(ROLES.MOULDING_ENGINEER),
  validateObjectId('id'),
  mouldingController.remove
);

module.exports = router;
