'use strict';

const customerService = require('../services/customer.service');

// POST /api/v1/customers  (admin) — body validated by requireBody(['name'])
async function create(req, res, next) {
  try {
    const customer = await customerService.createCustomer({
      name: req.body.name,
      createdBy: req.user.id,
    });
    res.status(201).json({ customer });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/customers  (admin, engineers) — supports ?search=&page=&limit=
async function list(req, res, next) {
  try {
    const result = await customerService.listCustomers(req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/customers/:id  (admin)
async function getById(req, res, next) {
  try {
    const customer = await customerService.getCustomerById(req.params.id);
    res.status(200).json({ customer });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/customers/:id  (admin) — safe delete. Blocked (409) when the customer
// owns products/orders/portal users so manufacturing history is preserved.
async function remove(req, res, next) {
  try {
    const result = await customerService.deleteCustomer(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getById, remove };
