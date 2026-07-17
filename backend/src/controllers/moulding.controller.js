'use strict';

const mouldingService = require('../services/moulding.service');
const productionStoreService = require('../services/productionStore.service');

// GET /api/v1/moulding/production-store/item-code?purchaseOrderId=
async function productionStoreItemCode(req, res, next) {
  try {
    res.status(200).json(await productionStoreService.getItemCodeStore(req.query.purchaseOrderId));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding/production-store/cumulative?purchaseOrderId=
async function productionStoreCumulative(req, res, next) {
  try {
    res.status(200).json(await productionStoreService.getPOCumulativeStore(req.query.purchaseOrderId));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding/po-dashboard — Active / Archived POs for moulding.
async function poDashboard(req, res, next) {
  try {
    res.status(200).json(await mouldingService.getMouldingPODashboard());
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/moulding  (moulding_engineer)
async function create(req, res, next) {
  try {
    const result = await mouldingService.createMouldingRecord({
      payload: req.body,
      file: req.file,
      createdBy: req.user.id,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/moulding/:id  (moulding_engineer — own records, within 12 h)
async function update(req, res, next) {
  try {
    const record = await mouldingService.updateMouldingRecord(req.params.id, req.body, req.user);
    res.status(200).json({ record });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/moulding/:id  (moulding_engineer — own records, within 12 h)
async function remove(req, res, next) {
  try {
    const result = await mouldingService.deleteMouldingRecord(req.params.id, req.user);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/moulding/recover  (moulding_engineer)
// Record good pieces recovered from inspected rejected shots → product surplus.
async function recover(req, res, next) {
  try {
    const result = await mouldingService.recoverPieces({
      orderId: req.body.orderId,
      productId: req.body.productId,
      customerId: req.body.customerId,
      recoveries: req.body.recoveries,
      createdBy: req.user.id,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding/dashboard  (moulding_engineer, admin)
// Companies → products → active order counts for the moulding dashboard.
async function dashboard(req, res, next) {
  try {
    const data = await mouldingService.getMouldingDashboard();
    res.status(200).json({ customers: data });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding/mine  (moulding_engineer) — all dept records (shared visibility)
async function listMine(req, res, next) {
  try {
    const result = await mouldingService.listMyRecords(req.user.id, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding  (admin)
async function listAll(req, res, next) {
  try {
    const result = await mouldingService.listAllRecords(req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding/status?orderId=  (admin, moulding_engineer)
async function status(req, res, next) {
  try {
    const result = await mouldingService.computeOrderStatus(req.query.orderId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding/molds?productId=
async function listMolds(req, res, next) {
  try {
    const result = await mouldingService.listMoldsForProduct(req.query.productId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/moulding/molds
async function createMold(req, res, next) {
  try {
    const mold = await mouldingService.upsertMold(req.body, req.user.id);
    res.status(201).json({ mold });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding/order-molds?orderId=
async function listOrderMolds(req, res, next) {
  try {
    const result = await mouldingService.listOrderMolds(req.query.orderId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/moulding/order-molds
async function createOrderMold(req, res, next) {
  try {
    const mold = await mouldingService.upsertOrderMold(req.body, req.user.id);
    res.status(201).json({ mold });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding/rejection-reasons
async function rejectionReasons(req, res, next) {
  try {
    res.status(200).json(await mouldingService.listRejectionReasons());
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/moulding/rejection-reasons  — persist a custom defect immediately.
async function saveRejectionReason(req, res, next) {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'missing_reason', message: 'reason is required' });
    await mouldingService.persistRejectionReason(reason, req.user.id);
    res.status(200).json(await mouldingService.listRejectionReasons());
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/moulding/:id
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
  update,
  remove,
  recover,
  dashboard,
  listMine,
  listAll,
  status,
  listMolds,
  createMold,
  listOrderMolds,
  createOrderMold,
  productionStoreItemCode,
  productionStoreCumulative,
  poDashboard,
  rejectionReasons,
  saveRejectionReason,
  getById,
};
