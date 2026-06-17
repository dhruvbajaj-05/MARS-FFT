'use strict';

const express = require('express');
const customerViewController = require('../controllers/customerView.controller');
const protect = require('../middleware/protect');
const { validateObjectId } = require('../middleware/validate');
const { ROLES } = require('../utils/roles');

// Phase 8 — Customer dashboard (Module 5). READ-ONLY.
// Every route is locked to the `customer` role via RBAC (...protect(ROLES.CUSTOMER));
// the service further forces all queries to the token's own customerId. There are
// deliberately no POST/PUT/PATCH/DELETE routes here.
const router = express.Router();

// Dashboard counters (Total / Active / Completed / Delayed).
router.get('/dashboard', ...protect(ROLES.CUSTOMER), customerViewController.dashboard);

// This customer's Component Store availability (Product → Part → quantity).
router.get('/components', ...protect(ROLES.CUSTOMER), customerViewController.components);

// This customer's Finished Goods availability (Product → quantity).
router.get('/finished-goods', ...protect(ROLES.CUSTOMER), customerViewController.finishedGoods);

// This customer's orders (paginated) with an end-to-end status summary.
router.get('/orders', ...protect(ROLES.CUSTOMER), customerViewController.listOrders);

// One order: details + QC summary + dispatch summary + photos.
router.get(
  '/orders/:id',
  ...protect(ROLES.CUSTOMER),
  validateObjectId('id'),
  customerViewController.getOrder
);

// One order's manufacturing progress across all four departments.
router.get(
  '/orders/:id/progress',
  ...protect(ROLES.CUSTOMER),
  validateObjectId('id'),
  customerViewController.getOrderProgress
);

module.exports = router;
