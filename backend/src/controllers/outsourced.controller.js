'use strict';

const outsourcedService = require('../services/outsourced.service');

// Outsourced Components store. Reads are open to component viewers; writes (create/edit/
// delete/adjust) are restricted to Moulding Engineers by the routes.

async function list(req, res, next) {
  try {
    res.status(200).json(
      await outsourcedService.listForOrder({
        customerId: req.query.customerId,
        productId: req.query.productId,
        orderId: req.query.orderId,
      })
    );
  } catch (err) {
    next(err);
  }
}

async function suggestions(req, res, next) {
  try {
    res.status(200).json(
      await outsourcedService.suggestions({
        customerId: req.query.customerId,
        productId: req.query.productId,
      })
    );
  } catch (err) {
    next(err);
  }
}

// Create / upsert. scope 'order' (default) or 'surplus'; mode 'set' (default) or 'add'.
async function create(req, res, next) {
  try {
    const item = await outsourcedService.upsert({
      scope: req.body.scope,
      customerId: req.body.customerId,
      productId: req.body.productId,
      orderId: req.body.orderId,
      componentName: req.body.componentName,
      quantity: req.body.quantity,
      mode: req.body.mode,
    });
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

// Allocate received outsourced stock for an order: splits into order allocation + surplus
// using the per-set requirement (Moulding only).
async function allocate(req, res, next) {
  try {
    const result = await outsourcedService.allocate({
      customerId: req.body.customerId,
      productId: req.body.productId,
      orderId: req.body.orderId,
      componentName: req.body.componentName,
      received: req.body.received,
      perSet: req.body.perSet,
      createdBy: req.user.id,
    });
    res.status(201).json({ allocation: result });
  } catch (err) {
    next(err);
  }
}

// Edit an existing row: pass { quantity } to set it absolutely, or { delta } to adjust it.
async function update(req, res, next) {
  try {
    const scope = req.body.scope;
    const item =
      req.body.delta !== undefined
        ? await outsourcedService.adjust({ id: req.params.id, scope, delta: req.body.delta })
        : await outsourcedService.setQuantity({ id: req.params.id, scope, quantity: req.body.quantity });
    res.status(200).json({ item });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    res.status(200).json(await outsourcedService.remove({ id: req.params.id, scope: req.query.scope }));
  } catch (err) {
    next(err);
  }
}

module.exports = { list, suggestions, create, allocate, update, remove };
