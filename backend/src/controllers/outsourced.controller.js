'use strict';

const outsourcedService = require('../services/outsourced.service');

// Outsourced Components store. Reads are open to component viewers; writes (BOM edits +
// received transactions) are restricted to Moulding Engineers by the routes. Inventory is
// transaction-based: receipts are the source of truth, balances are derived by reconcile.

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

// ---- Order BOM (per-order snapshot; never touches the master Assortment) ----

async function setBomRow(req, res, next) {
  try {
    const item = await outsourcedService.setBomRow({
      customerId: req.body.customerId,
      productId: req.body.productId,
      orderId: req.body.orderId,
      componentName: req.body.componentName,
      perSet: req.body.perSet,
    });
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

async function removeBomRow(req, res, next) {
  try {
    res.status(200).json(await outsourcedService.removeBomRow({ id: req.params.id }));
  } catch (err) {
    next(err);
  }
}

// ---- Receipts (transaction-based inventory) ----

async function listReceipts(req, res, next) {
  try {
    res.status(200).json(
      await outsourcedService.listReceipts({
        customerId: req.query.customerId,
        productId: req.query.productId,
        orderId: req.query.orderId,
      })
    );
  } catch (err) {
    next(err);
  }
}

async function createReceipt(req, res, next) {
  try {
    const receipt = await outsourcedService.createReceipt({
      customerId: req.body.customerId,
      productId: req.body.productId,
      orderId: req.body.orderId,
      componentName: req.body.componentName,
      quantityReceived: req.body.quantityReceived,
      perSet: req.body.perSet,
      remarks: req.body.remarks,
      createdBy: req.user.id,
    });
    res.status(201).json({ receipt });
  } catch (err) {
    next(err);
  }
}

async function updateReceipt(req, res, next) {
  try {
    const receipt = await outsourcedService.updateReceipt({
      id: req.params.id,
      quantityReceived: req.body.quantityReceived,
      remarks: req.body.remarks,
      user: req.user,
    });
    res.status(200).json({ receipt });
  } catch (err) {
    next(err);
  }
}

async function deleteReceipt(req, res, next) {
  try {
    res.status(200).json(await outsourcedService.deleteReceipt({ id: req.params.id, user: req.user }));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  suggestions,
  setBomRow,
  removeBomRow,
  listReceipts,
  createReceipt,
  updateReceipt,
  deleteReceipt,
};
