'use strict';

const mouldingService = require('../services/moulding.service');

// POST /api/v1/moulding  (moulding_engineer)
// Accepts multipart/form-data: the record fields + an optional `image` file.
async function create(req, res, next) {
  try {
    const result = await mouldingService.createMouldingRecord({
      payload: req.body,
      file: req.file, // set by the upload middleware when an image is present
      createdBy: req.user.id,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding/mine  (moulding_engineer) — this engineer's own records
async function listMine(req, res, next) {
  try {
    const result = await mouldingService.listMyRecords(req.user.id, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding  (admin) — read-all across customers/orders, with filters
async function listAll(req, res, next) {
  try {
    const result = await mouldingService.listAllRecords(req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding/status?orderId=  (admin, moulding_engineer) — computed status
async function status(req, res, next) {
  try {
    const result = await mouldingService.computeOrderStatus(req.query.orderId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding/molds?productId=  (admin, moulding_engineer)
// Learned molds for a product — drives the dropdown and the Part Name autofill.
async function listMolds(req, res, next) {
  try {
    const result = await mouldingService.listMoldsForProduct(req.query.productId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/moulding/molds  (moulding_engineer)
// Define or edit a mold (Mold Name, Part Name, Cavity, Required Shots) for a product.
async function createMold(req, res, next) {
  try {
    const mold = await mouldingService.upsertMold(req.body, req.user.id);
    res.status(201).json({ mold });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding/order-molds?orderId=  (admin, moulding_engineer)
// Per-order Mould Setup: molds defined for the order + product-level suggestions.
async function listOrderMolds(req, res, next) {
  try {
    const result = await mouldingService.listOrderMolds(req.query.orderId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/moulding/order-molds  (moulding_engineer)
// Define/edit a mold for one order (Mold Name, Part, Cavity, Required Shots).
async function createOrderMold(req, res, next) {
  try {
    const mold = await mouldingService.upsertOrderMold(req.body, req.user.id);
    res.status(201).json({ mold });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding/rejection-reasons  (admin, moulding_engineer)
async function rejectionReasons(req, res, next) {
  try {
    res.status(200).json(await mouldingService.listRejectionReasons());
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding/:id  (admin: any; moulding_engineer: own)
async function getById(req, res, next) {
  try {
    const record = await mouldingService.getRecordById(req.params.id, req.user);
    res.status(200).json({ record });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  create,
  listMine,
  listAll,
  status,
  listMolds,
  createMold,
  listOrderMolds,
  createOrderMold,
  rejectionReasons,
  getById,
};
