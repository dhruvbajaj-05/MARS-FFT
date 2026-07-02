'use strict';

const express = require('express');
const outsourcedController = require('../controllers/outsourced.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { ROLES } = require('../utils/roles');

// Outsourced Components — a Component Store section for purchased/external parts.
//   READ  → admin + moulding + assembly (same audience as the Component Store).
//   WRITE → Moulding Engineers ONLY (BOM edits + received transactions). Everyone else
//           is read-only, enforced here.
//
// Inventory is transaction-based: each receipt is an immutable record; balances (order
// allocation, product surplus, procurement need) are DERIVED by reconcile on every write.
const router = express.Router();

const VIEWERS = [ROLES.ADMIN, ROLES.MOULDING_ENGINEER, ROLES.ASSEMBLY_ENGINEER];

// This order's outsourced BOM/components + product-level surplus + receipts + suggestions.
router.get('/', ...protect(...VIEWERS), outsourcedController.list);
router.get('/suggestions', ...protect(...VIEWERS), outsourcedController.suggestions);
router.get('/receipts', ...protect(...VIEWERS), outsourcedController.listReceipts);

// Order BOM snapshot editing (Moulding only) — never mutates the master Assortment.
router.post(
  '/bom',
  ...protect(ROLES.MOULDING_ENGINEER),
  requireBody(['customerId', 'productId', 'orderId', 'componentName', 'perSet']),
  outsourcedController.setBomRow
);
router.delete('/bom/:id', ...protect(ROLES.MOULDING_ENGINEER), validateObjectId('id'), outsourcedController.removeBomRow);

// Received-stock transactions (Moulding only).
router.post(
  '/receipt',
  ...protect(ROLES.MOULDING_ENGINEER),
  requireBody(['customerId', 'productId', 'orderId', 'componentName', 'quantityReceived']),
  outsourcedController.createReceipt
);
router.patch('/receipt/:id', ...protect(ROLES.MOULDING_ENGINEER), validateObjectId('id'), outsourcedController.updateReceipt);
router.delete('/receipt/:id', ...protect(ROLES.MOULDING_ENGINEER), validateObjectId('id'), outsourcedController.deleteReceipt);

module.exports = router;
