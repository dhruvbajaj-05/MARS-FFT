'use strict';

const express = require('express');
const qcController = require('../controllers/qc.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { arrayImages } = require('../middleware/upload');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// Phase 4 re-anchor: QC is keyed on Customer + Product; orderId is optional.
const REQUIRED_FIELDS = [
  'productId', 'customerId',
  'inspectionDate', 'inspectionType', 'sampleSize',
  'acceptedQuantity', 'rejectedQuantity', 'defectCount',
];

// Create a QC record — QC engineer only.
// `arrayImages` (multipart) runs before requireBody so text fields are parsed first.
router.post(
  '/',
  ...protect(ROLES.QC_ENGINEER),
  arrayImages('qc', 'photos'),
  requireBody(REQUIRED_FIELDS),
  qcController.create
);

// This engineer's own records — QC engineer only.
router.get('/mine', ...protect(ROLES.QC_ENGINEER), qcController.listMine);

// Computed QC status for an order — admin + QC engineer + dispatch engineer.
router.get(
  '/status',
  ...protect(ROLES.ADMIN, ROLES.QC_ENGINEER, ROLES.PACKING_DISPATCH_ENGINEER),
  qcController.status
);

// Read-all across customers/orders — admin only.
router.get('/', ...protect(ROLES.ADMIN), qcController.listAll);

// Get one — admin (any) or QC engineer (own, enforced in the service).
router.get(
  '/:id',
  ...protect(ROLES.ADMIN, ROLES.QC_ENGINEER),
  validateObjectId('id'),
  qcController.getById
);

module.exports = router;
