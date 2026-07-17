'use strict';

const qcReportService = require('../services/qcReport.service');

// POST /api/v1/qc-reports  (engineers + admin)
// multipart/form-data: report fields (defects/tags as JSON strings) + optional `photos`.
async function create(req, res, next) {
  try {
    const result = await qcReportService.createReport({
      payload: req.body,
      files: req.files, // set by the arrayImages upload middleware
      user: req.user,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/qc-reports  (engineers + admin) — list + filters + search
async function list(req, res, next) {
  try {
    res.status(200).json(await qcReportService.listReports(req.query));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/qc-reports/order-context?orderId=&department=
async function orderContext(req, res, next) {
  try {
    res.status(200).json(
      await qcReportService.orderContext({
        orderId: req.query.orderId,
        department: req.query.department,
      })
    );
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/qc-reports/active-orders?department=  — item codes in a department's active QC list
async function activeOrders(req, res, next) {
  try {
    res.status(200).json(await qcReportService.listActiveOrders({ department: req.query.department }));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/qc-reports/archived-orders?department=  — item codes moved to Archived QC
async function archivedOrders(req, res, next) {
  try {
    res.status(200).json(await qcReportService.listArchivedOrders({ department: req.query.department }));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/qc-reports/active-pos?department=  — POs in a department's active QC
async function activePOs(req, res, next) {
  try {
    res.status(200).json(await qcReportService.listActivePOs({ department: req.query.department }));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/qc-reports/archived-pos?department=  — POs moved to QC Archive
async function archivedPOs(req, res, next) {
  try {
    res.status(200).json(await qcReportService.listArchivedPOs({ department: req.query.department }));
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/qc-reports/close-po  { purchaseOrderId, department } — "Done with QC for this PO"
async function closePO(req, res, next) {
  try {
    res.status(200).json(
      await qcReportService.closePO({ purchaseOrderId: req.body.purchaseOrderId, department: req.body.department })
    );
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/qc-reports/close-order  { orderId, department } — "Done Uploading QC Photos"
async function closeOrder(req, res, next) {
  try {
    res.status(200).json(
      await qcReportService.closeOrder({ orderId: req.body.orderId, department: req.body.department })
    );
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/qc-reports/summary?orderId=&department=
async function summary(req, res, next) {
  try {
    res.status(200).json(
      await qcReportService.summary({ orderId: req.query.orderId, department: req.query.department })
    );
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/qc-reports/defect-types
async function listDefectTypes(req, res, next) {
  try {
    res.status(200).json({ defectTypes: await qcReportService.listDefectTypes() });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/qc-reports/defect-types  { name }
async function addDefectType(req, res, next) {
  try {
    const defectTypes = await qcReportService.addDefectType(req.body.name, req.user.id);
    res.status(201).json({ defectTypes });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/qc-reports/:id
async function getById(req, res, next) {
  try {
    res.status(200).json({ report: await qcReportService.getReport(req.params.id) });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/qc-reports/:id/status  { status, note }
async function setStatus(req, res, next) {
  try {
    const report = await qcReportService.updateStatus(
      req.params.id,
      req.body.status,
      req.body.note,
      req.user
    );
    res.status(200).json({ report });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/qc-reports/:id/comments  { text }
async function addComment(req, res, next) {
  try {
    const report = await qcReportService.addComment(req.params.id, req.body.text, req.user);
    res.status(201).json({ report });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/qc-notifications  (admin)
async function listNotifications(req, res, next) {
  try {
    res.status(200).json(await qcReportService.listNotifications(req.query));
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/qc-notifications/:id/read  (admin)
async function markNotificationRead(req, res, next) {
  try {
    res.status(200).json(await qcReportService.markNotificationRead(req.params.id));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  create,
  list,
  orderContext,
  activeOrders,
  archivedOrders,
  activePOs,
  archivedPOs,
  closePO,
  closeOrder,
  summary,
  listDefectTypes,
  addDefectType,
  getById,
  setStatus,
  addComment,
  listNotifications,
  markNotificationRead,
};
