'use strict';

const assemblyService = require('../services/assembly.service');
const assortmentService = require('../services/assortment.service');

// POST /api/v1/assembly  (assembly_engineer)
// multipart/form-data: record fields + optional `photos` files (repeatable).
async function create(req, res, next) {
  try {
    const result = await assemblyService.createAssemblyRecord({
      payload: req.body,
      files: req.files, // set by the arrayImages upload middleware
      submittedBy: req.user.id,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/assembly/mine  (assembly_engineer) — this engineer's own records
async function listMine(req, res, next) {
  try {
    const result = await assemblyService.listMyRecords(req.user.id, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/assembly  (admin) — read-all across customers/orders, with filters
async function listAll(req, res, next) {
  try {
    const result = await assemblyService.listAllRecords(req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/assembly/availability?customerId=&productId=&orderId=
// (admin, assembly_engineer) — the order's finished components available to assemble from.
async function availability(req, res, next) {
  try {
    const result = await assemblyService.getComponentAvailability(
      req.query.customerId,
      req.query.productId,
      req.query.orderId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/assembly/status?orderId=  (admin, assembly_engineer, qc_engineer)
// QC engineers consume this to view assembly progress for an order.
async function status(req, res, next) {
  try {
    const result = await assemblyService.computeOrderStatus(req.query.orderId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/assembly/assortments?customerId=&productId=
// (admin, assembly_engineer) — saved parts-per-set for a product (dropdown suggestion).
async function getAssortment(req, res, next) {
  try {
    const result = await assortmentService.getAssortment(req.query.customerId, req.query.productId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/assembly/assortments  (assembly_engineer)
// Create/edit the assortment (parts-per-set) for a product.
async function saveAssortment(req, res, next) {
  try {
    const result = await assortmentService.upsertAssortment({
      customerId: req.body.customerId,
      productId: req.body.productId,
      parts: req.body.parts,
      updatedBy: req.user.id,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/assembly/:id  (admin: any; assembly_engineer: own)
async function getById(req, res, next) {
  try {
    const record = await assemblyService.getRecordById(req.params.id, req.user);
    res.status(200).json({ record });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  create,
  availability,
  listMine,
  listAll,
  status,
  getAssortment,
  saveAssortment,
  getById,
};
