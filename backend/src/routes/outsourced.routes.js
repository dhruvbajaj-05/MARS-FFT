'use strict';

const express = require('express');
const outsourcedController = require('../controllers/outsourced.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { ROLES } = require('../utils/roles');

// Outsourced Components — a Component Store section for purchased/external parts.
//   READ  → admin + moulding + assembly (same audience as the Component Store).
//   WRITE → Moulding Engineers ONLY (add / edit / delete / adjust). Everyone else
//           is read-only, enforced here.
const router = express.Router();

const VIEWERS = [ROLES.ADMIN, ROLES.MOULDING_ENGINEER, ROLES.ASSEMBLY_ENGINEER];

// This order's outsourced components + product-level surplus + name suggestions.
router.get('/', ...protect(...VIEWERS), outsourcedController.list);
router.get('/suggestions', ...protect(...VIEWERS), outsourcedController.suggestions);

// Create / upsert a component (Moulding only).
router.post(
  '/',
  ...protect(ROLES.MOULDING_ENGINEER),
  requireBody(['customerId', 'productId', 'componentName', 'quantity']),
  outsourcedController.create
);

// Allocate received stock for an order — splits into order allocation + surplus by the
// per-set requirement (Moulding only).
router.post(
  '/allocate',
  ...protect(ROLES.MOULDING_ENGINEER),
  requireBody(['customerId', 'productId', 'orderId', 'componentName', 'received', 'perSet']),
  outsourcedController.allocate
);

// Edit (set quantity) or adjust (delta) an existing component (Moulding only).
router.patch('/:id', ...protect(ROLES.MOULDING_ENGINEER), validateObjectId('id'), outsourcedController.update);

// Delete a component (Moulding only).
router.delete('/:id', ...protect(ROLES.MOULDING_ENGINEER), validateObjectId('id'), outsourcedController.remove);

module.exports = router;
