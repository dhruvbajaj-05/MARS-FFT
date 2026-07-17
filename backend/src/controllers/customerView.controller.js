'use strict';

const customerViewService = require('../services/customerView.service');

// Phase 8 — Customer dashboard (read-only). Every handler delegates to the service,
// which scopes all data to req.user.customerId. There are intentionally no
// create/update/delete handlers.

// GET /api/v1/customer/dashboard  (customer) — order counters for this customer.
async function dashboard(req, res, next) {
  try {
    const result = await customerViewService.getDashboard(req.user);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/customer/orders  (customer) — paginated list of own orders + summary.
async function listOrders(req, res, next) {
  try {
    const result = await customerViewService.listOrders(req.user, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/customer/orders/:id  (customer) — full detail for one own order.
async function getOrder(req, res, next) {
  try {
    const result = await customerViewService.getOrderDetails(req.user, req.params.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/customer/orders/:id/progress  (customer) — per-department progress.
async function getOrderProgress(req, res, next) {
  try {
    const result = await customerViewService.getOrderProgress(req.user, req.params.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/customer/products  (customer) — Home grid: products + headline summary.
async function products(req, res, next) {
  try {
    const result = await customerViewService.getProducts(req.user);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/customer/products/:id/orders  (customer) — a product's OrderIDs.
async function productOrders(req, res, next) {
  try {
    const result = await customerViewService.getProductOrders(req.user, req.params.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/customer/orders/:id/dashboard  (customer) — full manufacturing dashboard.
async function orderDashboard(req, res, next) {
  try {
    const result = await customerViewService.getOrderDashboard(req.user, req.params.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/customer/components  (customer) — Component Store availability.
async function components(req, res, next) {
  try {
    const result = await customerViewService.getComponentAvailability(req.user);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/customer/finished-goods  (customer) — Finished Goods availability.
async function finishedGoods(req, res, next) {
  try {
    const result = await customerViewService.getFinishedGoods(req.user);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/customer/orders/:id/qc-reports/:reportId/comments  (customer)
// The only write in this module — append a comment to a QC case on the customer's own order.
async function addQcComment(req, res, next) {
  try {
    const result = await customerViewService.addQcComment(
      req.user,
      req.params.id,
      req.params.reportId,
      req.body.text
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  dashboard,
  listOrders,
  getOrder,
  getOrderProgress,
  components,
  finishedGoods,
  products,
  productOrders,
  orderDashboard,
  addQcComment,
};
