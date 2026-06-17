'use strict';

const express = require('express');
const authRoutes = require('./auth.routes');
const customerRoutes = require('./customer.routes');
const productRoutes = require('./product.routes');
const orderRoutes = require('./order.routes');
const userRoutes = require('./user.routes');
const mouldingRoutes = require('./moulding.routes');
const assemblyRoutes = require('./assembly.routes');
const qcRoutes = require('./qc.routes');
const dispatchRoutes = require('./dispatch.routes');
const customerViewRoutes = require('./customerView.routes');
const adminRoutes = require('./admin.routes');
const storeRoutes = require('./store.routes');
const outsourcedRoutes = require('./outsourced.routes');
const machineRoutes = require('./machine.routes');

const router = express.Router();

// Health check.
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'fft-manufacturing-backend' });
});

// Phase 1 — authentication.
router.use('/auth', authRoutes);

// Phase 3 — admin module: master data + user management (admin-only writes;
// engineers may read customers/products/orders to drive dropdowns).
router.use('/customers', customerRoutes);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/users', userRoutes);

// Machine Master — admin manages; moulding engineers list for the production dropdown.
router.use('/machines', machineRoutes);

// Phase 4 — Moulding module (Module 1): engineer create + image upload,
// admin read-all, computed Pending/In Progress/Completed status.
router.use('/moulding', mouldingRoutes);

// Component Store + Finished Goods Store (read-only views + ledger). Balances are
// written as side effects of moulding (component IN), QC (finished IN) and dispatch
// (finished OUT) submissions — see store.service.
// Outsourced Components (purchased/external parts) — order-scoped store section, kept
// separate from moulded inventory. Moulding writes; admin/assembly read. Mounted before
// '/store' so this more specific path is matched first.
router.use('/store/outsourced', outsourcedRoutes);

router.use('/store', storeRoutes);

// Phase 5 — Assembly module (Module 2): engineer create + photo uploads, admin
// read-all, QC may view status; integrates with Moulding (output → input).
router.use('/assembly', assemblyRoutes);

// Phase 6 — QC module (Module 3): engineer create + photo uploads, admin read-all,
// dispatch may view status; integrates with Assembly (good output → inspection).
router.use('/qc', qcRoutes);

// Phase 7 — Packing & Dispatch module (Module 4): engineer create + photo/document
// uploads, admin read-all; integrates with QC (approved qty → dispatch).
router.use('/packing-dispatch', dispatchRoutes);

// Phase 8 — Customer dashboard (Module 5): read-only, customer-role only; every
// query is auto-scoped to the token's own customerId (no create/edit/delete).
router.use('/customer', customerViewRoutes);

// Phase 9 — Admin dashboard (Module 6): read-only, admin-role only; system-wide
// analytics across customers, products, orders, users and all four departments.
router.use('/admin', adminRoutes);

// ---- Mounted in later phases (do NOT enable yet) ----
// router.use('/notifications', notificationRoutes);
// router.use('/uploads', uploadRoutes);

module.exports = router;
