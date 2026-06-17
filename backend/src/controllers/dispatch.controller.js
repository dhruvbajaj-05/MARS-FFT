'use strict';

const dispatchService = require('../services/dispatch.service');

// POST /api/v1/packing-dispatch  (packing_dispatch_engineer)
// multipart/form-data: record fields + optional `photos` and `documents` files.
async function create(req, res, next) {
  try {
    const result = await dispatchService.createDispatchRecord({
      payload: req.body,
      files: req.files, // { photos: [...], documents: [...] } from the upload middleware
      submittedBy: req.user.id,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/packing-dispatch/mine  (packing_dispatch_engineer) — own records
async function listMine(req, res, next) {
  try {
    const result = await dispatchService.listMyRecords(req.user.id, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/packing-dispatch  (admin) — read-all across customers/orders
async function listAll(req, res, next) {
  try {
    const result = await dispatchService.listAllRecords(req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/packing-dispatch/status?orderId=  (admin, packing_dispatch_engineer)
async function status(req, res, next) {
  try {
    const result = await dispatchService.computeOrderStatus(req.query.orderId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/packing-dispatch/:id  (admin: any; packing_dispatch_engineer: own)
async function getById(req, res, next) {
  try {
    const record = await dispatchService.getRecordById(req.params.id, req.user);
    res.status(200).json({ record });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, listMine, listAll, status, getById };
