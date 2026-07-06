'use strict';

const express = require('express');
const productController = require('../controllers/product.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { ROLES, ENGINEER_ROLES } = require('../utils/roles');

const router = express.Router();

// Create — admin only. A product belongs to a customer.
router.post(
  '/',
  ...protect(ROLES.ADMIN),
  requireBody(['customerId', 'name']),
  productController.create
);

// List — admin + engineers (cascading dropdown; filter with ?customerId=).
router.get('/', ...protect(ROLES.ADMIN, ...ENGINEER_ROLES), productController.list);

// Get one — admin only.
router.get('/:id', ...protect(ROLES.ADMIN), validateObjectId('id'), productController.getById);

// Edit — admin only.
router.patch('/:id', ...protect(ROLES.ADMIN), validateObjectId('id'), productController.update);

// Delete — admin only. Blocked when the product has production history; else removed.
router.delete('/:id', ...protect(ROLES.ADMIN), validateObjectId('id'), productController.remove);

module.exports = router;
