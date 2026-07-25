'use strict';

const express = require('express');
const controller = require('../controllers/qcReport.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { arrayImages } = require('../middleware/upload');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// The centralized QC (Quality Management) module. Capability-scoped access:
//   • QC_VIEWERS  — everyone in the flow READS reports (moulding + assembly engineers see
//     them read-only, admin + qc engineer see everything). Customers read via customerView.
//   • QC_AUTHOR   — only the QC Engineer authors reports (create / upload / defect vocab) and
//     archives QC ("Done QC" per order/PO). Req #7/#8/#9.
//   • QC_CASE     — the QC Engineer AND the Admin may open/close a case + comment. Req #11.
// Kept fully separate from the finished-goods `/qc` module.
const QC_VIEWERS = [
  ROLES.MOULDING_ENGINEER,
  ROLES.ASSEMBLY_ENGINEER,
  ROLES.QC_ENGINEER,
  ROLES.ADMIN,
];
const QC_AUTHOR = [ROLES.QC_ENGINEER];
const QC_CASE = [ROLES.QC_ENGINEER, ROLES.ADMIN];

const CREATE_FIELDS = ['department', 'customerId', 'productId', 'orderId', 'severity'];

// Create a QC report — QC Engineer only. `arrayImages` (multipart) runs before requireBody
// so text fields (incl. defects/tags JSON strings) are parsed first.
router.post(
  '/',
  ...protect(...QC_AUTHOR),
  arrayImages('qc-reports', 'photos'),
  requireBody(CREATE_FIELDS),
  controller.create
);

// List + filters + search (read).
router.get('/', ...protect(...QC_VIEWERS), controller.list);

// Order QC Dashboard context + summary (specific paths before '/:id').
router.get('/order-context', ...protect(...QC_VIEWERS), controller.orderContext);
router.get('/summary', ...protect(...QC_VIEWERS), controller.summary);

// Active + archived QC item codes for a department (read).
router.get('/active-orders', ...protect(...QC_VIEWERS), controller.activeOrders);
router.get('/archived-orders', ...protect(...QC_VIEWERS), controller.archivedOrders);

// PO-level QC lists (read) + "Done QC" archive (QC Engineer only — req #9).
router.get('/active-pos', ...protect(...QC_VIEWERS), controller.activePOs);
router.get('/archived-pos', ...protect(...QC_VIEWERS), controller.archivedPOs);
router.post(
  '/close-po',
  ...protect(...QC_AUTHOR),
  requireBody(['purchaseOrderId', 'department']),
  controller.closePO
);
router.post(
  '/close-order',
  ...protect(...QC_AUTHOR),
  requireBody(['orderId', 'department']),
  controller.closeOrder
);

// Shared defect vocabulary — read by all, extended by the QC Engineer.
router.get('/defect-types', ...protect(...QC_VIEWERS), controller.listDefectTypes);
router.post('/defect-types', ...protect(...QC_AUTHOR), requireBody(['name']), controller.addDefectType);

// One report (read).
router.get('/:id', ...protect(...QC_VIEWERS), validateObjectId('id'), controller.getById);

// Open/close a case — QC Engineer + Admin (req #11).
router.patch(
  '/:id/status',
  ...protect(...QC_CASE),
  validateObjectId('id'),
  requireBody(['status']),
  controller.setStatus
);
// Comments — QC Engineer + Admin (customers comment via the customerView scoped route).
router.post(
  '/:id/comments',
  ...protect(...QC_CASE),
  validateObjectId('id'),
  requireBody(['text']),
  controller.addComment
);

module.exports = router;
