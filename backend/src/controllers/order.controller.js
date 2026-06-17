'use strict';

const orderService = require('../services/order.service');

// POST /api/v1/orders  (admin) — requireBody(['customerId','productId','orderQuantity'])
async function create(req, res, next) {
  try {
    const order = await orderService.createOrder({
      customerId: req.body.customerId,
      productId: req.body.productId,
      orderQuantity: req.body.orderQuantity,
      createdBy: req.user.id,
    });
    res.status(201).json({ order });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/orders  (admin, engineers) — ?productId=&customerId=&page=&limit=
async function list(req, res, next) {
  try {
    const result = await orderService.listOrders(req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/orders/:id  (admin, engineers)
async function getById(req, res, next) {
  try {
    const order = await orderService.getOrderById(req.params.id);
    res.status(200).json({ order });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/orders/:id/complete-production  (admin)
// "Complete Production" — moulding workspace clears; data becomes history under the
// OrderID. Records are preserved.
async function completeProduction(req, res, next) {
  try {
    const order = await orderService.completeProduction(req.params.id);
    res.status(200).json({ order });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/orders/:id/complete-assembly  (admin)
// "Complete Assembly" — assembly workspace clears; data becomes history.
async function completeAssembly(req, res, next) {
  try {
    const order = await orderService.completeAssembly(req.params.id);
    res.status(200).json({ order });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/orders/:id/archive  (admin) — retire an order from active lists.
async function archive(req, res, next) {
  try {
    const order = await orderService.archiveOrder(req.params.id);
    res.status(200).json({ order });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getById, completeProduction, completeAssembly, archive };
