'use strict';

const express = require('express');
const storeController = require('../controllers/store.controller');
const protect = require('../middleware/protect');
const { ROLES } = require('../utils/roles');

// Phase 2/4 — Store module. READ-ONLY HTTP surface (no create/update/delete here;
// balances change only as a side effect of department submissions). RBAC mirrors who
// works against each store:
//   Component Store      → admin, moulding (produces into it), assembly (works from it)
//   Finished Goods Store → admin, qc (produces into it), dispatch (ships from it)
const router = express.Router();

const COMPONENT_VIEWERS = [ROLES.ADMIN, ROLES.MOULDING_ENGINEER, ROLES.ASSEMBLY_ENGINEER];
const FINISHED_VIEWERS = [ROLES.ADMIN, ROLES.QC_ENGINEER, ROLES.PACKING_DISPATCH_ENGINEER];

// Component Store — declare the specific routes before the tree root.
router.get('/components/availability', ...protect(...COMPONENT_VIEWERS), storeController.componentAvailability);
router.get('/components/by-order', ...protect(...COMPONENT_VIEWERS), storeController.componentByOrder);
router.get('/components', ...protect(...COMPONENT_VIEWERS), storeController.componentTree);

// Finished Goods Store.
router.get('/finished-goods/availability', ...protect(...FINISHED_VIEWERS), storeController.finishedGoodsAvailability);
router.get('/finished-goods', ...protect(...FINISHED_VIEWERS), storeController.finishedGoodsTree);

// Full ledger audit trail — admin only.
router.get('/ledger', ...protect(ROLES.ADMIN), storeController.ledger);

module.exports = router;
