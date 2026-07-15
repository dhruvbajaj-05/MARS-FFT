'use strict';

const express = require('express');
const controller = require('../controllers/qcReport.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { arrayImages } = require('../middleware/upload');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// The centralized QC (Quality Management) module. Authored by moulding / assembly
// engineers (and QC engineers), read by Admin. Customer scoping is designed-in on the
// service and enabled later. Kept fully separate from the finished-goods `/qc` module.
const QC_AUTHORS = [
  ROLES.MOULDING_ENGINEER,
  ROLES.ASSEMBLY_ENGINEER,
  ROLES.QC_ENGINEER,
  ROLES.ADMIN,
];

const CREATE_FIELDS = ['department', 'customerId', 'productId', 'orderId', 'severity'];

// Create a QC report. `arrayImages` (multipart) runs before requireBody so text fields
// (incl. defects/tags JSON strings) are parsed first.
router.post(
  '/',
  ...protect(...QC_AUTHORS),
  arrayImages('qc-reports', 'photos'),
  requireBody(CREATE_FIELDS),
  controller.create
);

// List + filters + search.
router.get('/', ...protect(...QC_AUTHORS), controller.list);

// Order QC Dashboard context + summary (specific paths before '/:id').
router.get('/order-context', ...protect(...QC_AUTHORS), controller.orderContext);
router.get('/summary', ...protect(...QC_AUTHORS), controller.summary);

// Active QC orders for a department + "Done Uploading QC Photos" (req #11).
router.get('/active-orders', ...protect(...QC_AUTHORS), controller.activeOrders);
router.post(
  '/close-order',
  ...protect(...QC_AUTHORS),
  requireBody(['orderId', 'department']),
  controller.closeOrder
);

// Shared defect vocabulary (permanent, app-wide).
router.get('/defect-types', ...protect(...QC_AUTHORS), controller.listDefectTypes);
router.post('/defect-types', ...protect(...QC_AUTHORS), requireBody(['name']), controller.addDefectType);

// One report.
router.get('/:id', ...protect(...QC_AUTHORS), validateObjectId('id'), controller.getById);

// Status change (appends history) + comments.
router.patch(
  '/:id/status',
  ...protect(...QC_AUTHORS),
  validateObjectId('id'),
  requireBody(['status']),
  controller.setStatus
);
router.post(
  '/:id/comments',
  ...protect(...QC_AUTHORS),
  validateObjectId('id'),
  requireBody(['text']),
  controller.addComment
);

module.exports = router;
