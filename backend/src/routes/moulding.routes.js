'use strict';

const express = require('express');
const mouldingController = require('../controllers/moulding.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { singleImage } = require('../middleware/upload');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// Updated workflow: the engineer enters Shots Done + Rejected Pieces; cavity/part are
// resolved from the selected mold (so they are not required in the body). Good pieces
// are computed server-side (Shots × Cavity − Rejected).
// Shift is auto-detected server-side (no longer sent by the client).
const REQUIRED_FIELDS = [
  'orderId', 'productId', 'customerId',
  'moldName', 'machineNumber',
  'shotsDone', 'rejectedParts',
];

// Create a moulding record — moulding engineer only.
// `singleImage` (multipart) runs before requireBody so text fields are parsed first.
router.post(
  '/',
  ...protect(ROLES.MOULDING_ENGINEER),
  singleImage('moulding', 'image'),
  requireBody(REQUIRED_FIELDS),
  mouldingController.create
);

// This engineer's own records — moulding engineer only.
router.get('/mine', ...protect(ROLES.MOULDING_ENGINEER), mouldingController.listMine);

// Computed production status for an order — admin + moulding engineer.
router.get(
  '/status',
  ...protect(ROLES.ADMIN, ROLES.MOULDING_ENGINEER),
  mouldingController.status
);

// Remembered rejection reasons (dropdown + custom entry) — admin + moulding engineer.
router.get(
  '/rejection-reasons',
  ...protect(ROLES.ADMIN, ROLES.MOULDING_ENGINEER),
  mouldingController.rejectionReasons
);

// Learned molds for a product (Mold Learning dropdown + part autofill) — admin +
// moulding engineer. Declared before '/:id' so "molds" is not captured as an id.
router.get(
  '/molds',
  ...protect(ROLES.ADMIN, ROLES.MOULDING_ENGINEER),
  mouldingController.listMolds
);

// Define/edit a mold (Mold Name, Part, Cavity, Required Shots) — moulding engineer.
router.post(
  '/molds',
  ...protect(ROLES.MOULDING_ENGINEER),
  requireBody(['customerId', 'productId', 'moldName', 'partName', 'cavity']),
  mouldingController.createMold
);

// Per-order Mould Setup (revised workflow). Declared before '/:id'.
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

// Read-all across customers/orders — admin only.
router.get('/', ...protect(ROLES.ADMIN), mouldingController.listAll);

// Get one — admin (any) or moulding engineer (own, enforced in the service).
router.get(
  '/:id',
  ...protect(ROLES.ADMIN, ROLES.MOULDING_ENGINEER),
  validateObjectId('id'),
  mouldingController.getById
);

module.exports = router;
