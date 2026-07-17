'use strict';

const purchaseOrderService = require('../services/purchaseOrder.service');

// POST /api/v1/purchase-orders  (admin)
// body: { customerId, lines: [{ productId, orderQuantity }], notes? }
async function create(req, res, next) {
  try {
    const result = await purchaseOrderService.createPurchaseOrder({
      customerId: req.body.customerId,
      lines: req.body.lines,
      notes: req.body.notes,
      createdBy: req.user.id,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/purchase-orders  (admin, engineers) — ?customerId=&status=&page=&limit=
async function list(req, res, next) {
  try {
    res.status(200).json(await purchaseOrderService.listPurchaseOrders(req.query));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/purchase-orders/:id  (admin, engineers) — PO + its Item Code jobs
async function getById(req, res, next) {
  try {
    res.status(200).json(await purchaseOrderService.getPurchaseOrder(req.params.id));
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/purchase-orders/:id/lines  (admin) — add an item code job
async function addLine(req, res, next) {
  try {
    const job = await purchaseOrderService.addLine(req.params.id, {
      productId: req.body.productId,
      orderQuantity: req.body.orderQuantity,
    });
    res.status(201).json({ job });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/purchase-orders/:id/lines/:jobId  (admin) — remove an item code job
async function removeLine(req, res, next) {
  try {
    res.status(200).json(await purchaseOrderService.removeLine(req.params.id, req.params.jobId));
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/purchase-orders/:id  (admin) — edit notes / archive
async function update(req, res, next) {
  try {
    const purchaseOrder = await purchaseOrderService.updatePurchaseOrder(req.params.id, {
      notes: req.body.notes,
      status: req.body.status,
    });
    res.status(200).json({ purchaseOrder });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/purchase-orders/:id  (admin) — delete PO + clean jobs (409 if records exist)
async function remove(req, res, next) {
  try {
    res.status(200).json(await purchaseOrderService.deletePurchaseOrder(req.params.id));
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getById, addLine, removeLine, update, remove };
