'use strict';

const express = require('express');
const customerController = require('../controllers/customer.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { ROLES, ENGINEER_ROLES } = require('../utils/roles');

const router = express.Router();

// Create — admin only.
router.post(
  '/',
  ...protect(ROLES.ADMIN),
  requireBody(['name']),
  customerController.create
);

// List — admin + engineers (engineers use it to populate dropdowns).
router.get('/', ...protect(ROLES.ADMIN, ...ENGINEER_ROLES), customerController.list);

// Get one — admin only.
router.get('/:id', ...protect(ROLES.ADMIN), validateObjectId('id'), customerController.getById);

// Delete — admin only. Safe delete: blocked when the customer owns manufacturing data.
router.delete('/:id', ...protect(ROLES.ADMIN), validateObjectId('id'), customerController.remove);

module.exports = router;
