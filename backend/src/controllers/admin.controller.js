'use strict';

const adminService = require('../services/admin.service');

// Phase 9 — Admin dashboard (read-only). Every handler delegates to the admin
// service. Routes are admin-only (RBAC enforced in admin.routes.js).

// GET /api/v1/admin/dashboard — top-level counters.
async function dashboard(req, res, next) {
  try {
    res.status(200).json(await adminService.getDashboard());
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/production-summary — production quantities per department.
async function productionSummary(req, res, next) {
  try {
    res.status(200).json(await adminService.getProductionSummary());
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/orders — all orders (cross-customer) with status summary.
async function orders(req, res, next) {
  try {
    res.status(200).json(await adminService.listOrders(req.query));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/orders/delayed — active orders past the SLA age threshold.
async function delayedOrders(req, res, next) {
  try {
    res.status(200).json(await adminService.listDelayedOrders(req.query));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/rejections — rejection analytics across departments.
async function rejections(req, res, next) {
  try {
    res.status(200).json(await adminService.getRejections());
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/departments — per-department totals, rejections, throughput.
async function departments(req, res, next) {
  try {
    res.status(200).json(await adminService.getDepartments());
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/customers — per-customer order analytics + performance.
async function customers(req, res, next) {
  try {
    res.status(200).json(await adminService.getCustomerAnalytics(req.query));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/users — users grouped by role.
async function users(req, res, next) {
  try {
    res.status(200).json(await adminService.getUserAnalytics());
  } catch (err) {
    next(err);
  }
}

// --- Phase 7 analytics ---------------------------------------------------------

// GET /api/v1/admin/production/by-customer
async function productionByCustomer(req, res, next) {
  try {
    res.status(200).json(await adminService.getProductionByCustomer());
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/production/by-product
async function productionByProduct(req, res, next) {
  try {
    res.status(200).json(await adminService.getProductionByProduct());
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/production/by-mold
async function productionByMold(req, res, next) {
  try {
    res.status(200).json(await adminService.getProductionByMold());
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/inventory/components
async function inventoryComponents(req, res, next) {
  try {
    res.status(200).json(await adminService.getInventorySummary());
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/inventory/aging
async function inventoryAging(req, res, next) {
  try {
    res.status(200).json(await adminService.getInventoryAging());
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/inventory/low-stock?threshold=
async function lowStock(req, res, next) {
  try {
    res.status(200).json(await adminService.getLowStock(req.query));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/quality/qc
async function qcQuality(req, res, next) {
  try {
    res.status(200).json(await adminService.getQcQuality());
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/dispatch/summary
async function dispatchSummary(req, res, next) {
  try {
    res.status(200).json(await adminService.getDispatchSummary());
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/orders/:id/timeline
async function orderTimeline(req, res, next) {
  try {
    res.status(200).json(await adminService.getOrderTimeline(req.params.id));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/records/moulding
async function adminMouldingRecords(req, res, next) {
  try {
    res.status(200).json(await adminService.listAdminMouldingRecords(req.query));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/records/assembly
async function adminAssemblyRecords(req, res, next) {
  try {
    res.status(200).json(await adminService.listAdminAssemblyRecords(req.query));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/records/qc
async function adminQcRecords(req, res, next) {
  try {
    res.status(200).json(await adminService.listAdminQCRecords(req.query));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/records/dispatch
async function adminDispatchRecords(req, res, next) {
  try {
    res.status(200).json(await adminService.listAdminDispatchRecords(req.query));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  dashboard,
  productionSummary,
  orders,
  delayedOrders,
  rejections,
  departments,
  customers,
  users,
  productionByCustomer,
  productionByProduct,
  productionByMold,
  inventoryComponents,
  inventoryAging,
  lowStock,
  qcQuality,
  dispatchSummary,
  orderTimeline,
  adminMouldingRecords,
  adminAssemblyRecords,
  adminQcRecords,
  adminDispatchRecords,
};
