'use strict';

const express = require('express');
const assemblyController = require('../controllers/assembly.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { arrayImages } = require('../middleware/upload');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// Revised workflow: Assembly is keyed on Customer + Product + OrderID (the engineer
// selects an order; its quantity auto-loads). The engineer enters Assembled SETS;
// component consumption is derived from the product assortment and deducted from the
// SELECTED ORDER's finished components.
// Shift is auto-detected server-side. assembledSets / extraSets are validated in the
// service (a record is either normal sets OR extra-from-surplus sets).
const REQUIRED_FIELDS = [
  'orderId', 'productId', 'customerId',
  'assemblyLine', 'operatorCount', 'rejectedQuantity',
];

// Create an assembly record — assembly engineer only.
// `arrayImages` (multipart) runs before requireBody so text fields are parsed first.
router.post(
  '/',
  ...protect(ROLES.ASSEMBLY_ENGINEER),
  arrayImages('assembly', 'photos'),
  requireBody(REQUIRED_FIELDS),
  assemblyController.create
);

// Component availability for the chosen Customer + Product (drives the Assembly
// screen) — admin + assembly engineer. Reads the Component Store.
router.get(
  '/availability',
  ...protect(ROLES.ADMIN, ROLES.ASSEMBLY_ENGINEER),
  assemblyController.availability
);

// Assortment (parts-per-set) for a product — read by admin + assembly engineer,
// written by the assembly engineer. Declared before '/:id'.
router.get(
  '/assortments',
  ...protect(ROLES.ADMIN, ROLES.ASSEMBLY_ENGINEER),
  assemblyController.getAssortment
);
router.post(
  '/assortments',
  ...protect(ROLES.ASSEMBLY_ENGINEER),
  requireBody(['customerId', 'productId', 'parts']),
  assemblyController.saveAssortment
);

// This engineer's own records — assembly engineer only.
router.get('/mine', ...protect(ROLES.ASSEMBLY_ENGINEER), assemblyController.listMine);

// Computed assembly status for an order — admin + assembly engineer + QC engineer.
router.get(
  '/status',
  ...protect(ROLES.ADMIN, ROLES.ASSEMBLY_ENGINEER, ROLES.QC_ENGINEER),
  assemblyController.status
);

// Read-all across customers/orders — admin only.
router.get('/', ...protect(ROLES.ADMIN), assemblyController.listAll);

// Get one — admin (any) or assembly engineer (own, enforced in the service).
router.get(
  '/:id',
  ...protect(ROLES.ADMIN, ROLES.ASSEMBLY_ENGINEER),
  validateObjectId('id'),
  assemblyController.getById
);

// Edit / delete one — assembly engineer (own, within the 12h window; enforced in the service).
router.patch(
  '/:id',
  ...protect(ROLES.ASSEMBLY_ENGINEER),
  validateObjectId('id'),
  assemblyController.update
);
router.delete(
  '/:id',
  ...protect(ROLES.ASSEMBLY_ENGINEER),
  validateObjectId('id'),
  assemblyController.remove
);

module.exports = router;
