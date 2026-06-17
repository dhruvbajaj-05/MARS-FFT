'use strict';

const qcService = require('../services/qc.service');

// POST /api/v1/qc  (qc_engineer)
// multipart/form-data: record fields (defects as a JSON string) + optional `photos`.
async function create(req, res, next) {
  try {
    const result = await qcService.createQCRecord({
      payload: req.body,
      files: req.files, // set by the arrayImages upload middleware
      submittedBy: req.user.id,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/qc/mine  (qc_engineer) — this engineer's own records
async function listMine(req, res, next) {
  try {
    const result = await qcService.listMyRecords(req.user.id, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/qc  (admin) — read-all across customers/orders, with filters
async function listAll(req, res, next) {
  try {
    const result = await qcService.listAllRecords(req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/qc/status?orderId=  (admin, qc_engineer, packing_dispatch_engineer)
// Dispatch engineers consume this to view QC pass/fail status before dispatch.
async function status(req, res, next) {
  try {
    const result = await qcService.computeOrderStatus(req.query.orderId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/qc/:id  (admin: any; qc_engineer: own)
async function getById(req, res, next) {
  try {
    const record = await qcService.getRecordById(req.params.id, req.user);
    res.status(200).json({ record });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, listMine, listAll, status, getById };
