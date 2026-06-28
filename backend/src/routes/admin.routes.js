'use strict';

const express = require('express');
const adminController = require('../controllers/admin.controller');
const protect = require('../middleware/protect');
const { ROLES } = require('../utils/roles');

// Phase 9 — Admin dashboard (Module 6). READ-ONLY analytics.
// Every route is locked to the `admin` role via RBAC (...protect(ROLES.ADMIN)).
// There are deliberately no write routes here.
const router = express.Router();

// Top-level counters (customers, products, orders, active, completed).
router.get('/dashboard', ...protect(ROLES.ADMIN), adminController.dashboard);

// Production quantities per department.
router.get('/production-summary', ...protect(ROLES.ADMIN), adminController.productionSummary);

// Rejection analytics across departments.
router.get('/rejections', ...protect(ROLES.ADMIN), adminController.rejections);

// Per-department totals, rejections and throughput.
router.get('/departments', ...protect(ROLES.ADMIN), adminController.departments);

// Per-customer order analytics + performance summary.
router.get('/customers', ...protect(ROLES.ADMIN), adminController.customers);

// Users grouped by role.
router.get('/users', ...protect(ROLES.ADMIN), adminController.users);

// Orders. Specific routes before parameterized to avoid shadowing.
router.get('/orders/delayed', ...protect(ROLES.ADMIN), adminController.delayedOrders);
router.get('/orders', ...protect(ROLES.ADMIN), adminController.orders);
router.get('/orders/:id/timeline', ...protect(ROLES.ADMIN), adminController.orderTimeline);

// Department record lists — admin visibility across all records.
router.get('/records/moulding', ...protect(ROLES.ADMIN), adminController.adminMouldingRecords);
router.get('/records/assembly', ...protect(ROLES.ADMIN), adminController.adminAssemblyRecords);
router.get('/records/qc', ...protect(ROLES.ADMIN), adminController.adminQcRecords);
router.get('/records/dispatch', ...protect(ROLES.ADMIN), adminController.adminDispatchRecords);

// --- Phase 7 analytics ---------------------------------------------------------

// Production analytics — by customer, by product, by mold.
router.get('/production/by-customer', ...protect(ROLES.ADMIN), adminController.productionByCustomer);
router.get('/production/by-product', ...protect(ROLES.ADMIN), adminController.productionByProduct);
router.get('/production/by-mold', ...protect(ROLES.ADMIN), adminController.productionByMold);

// Inventory analytics — available components, aging, low-stock alerts.
router.get('/inventory/components', ...protect(ROLES.ADMIN), adminController.inventoryComponents);
router.get('/inventory/aging', ...protect(ROLES.ADMIN), adminController.inventoryAging);
router.get('/inventory/low-stock', ...protect(ROLES.ADMIN), adminController.lowStock);

// QC quality — approval / rejection rates.
router.get('/quality/qc', ...protect(ROLES.ADMIN), adminController.qcQuality);

// Dispatch — pending vs dispatched quantities.
router.get('/dispatch/summary', ...protect(ROLES.ADMIN), adminController.dispatchSummary);

module.exports = router;
