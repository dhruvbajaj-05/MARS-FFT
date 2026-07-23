'use strict';

const fs = require('fs');
const mongoose = require('mongoose');
const QCReport = require('../models/QCReport');
const QCDefectType = require('../models/QCDefectType');
const QCNotification = require('../models/QCNotification');
const MediaAsset = require('../models/MediaAsset');
const MouldingRecord = require('../models/MouldingRecord');
const AssemblyRecord = require('../models/AssemblyRecord');
const OrderMold = require('../models/OrderMold');
const Order = require('../models/Order');
const PurchaseOrder = require('../models/PurchaseOrder');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const User = require('../models/User');
const mouldingService = require('./moulding.service');
const assemblyService = require('./assembly.service');
const { resolveShift } = require('../utils/shift');
const { badRequest, notFound } = require('../utils/httpError');
const { parsePagination, buildList } = require('../utils/pagination');

const { DEPARTMENTS, SEVERITIES, STATUSES } = QCReport;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertDepartment(department) {
  if (!DEPARTMENTS.includes(department)) {
    throw badRequest(`department must be one of: ${DEPARTMENTS.join(', ')}`, 'invalid_department');
  }
  return department;
}

// Parse a field that may arrive as a JSON string (multipart) or a real array (JSON body),
// or a single comma-free string. Returns a trimmed, de-duplicated string array.
function parseStringArray(raw, fieldName) {
  if (raw === undefined || raw === null || raw === '') return [];
  let value = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        value = JSON.parse(trimmed);
      } catch (e) {
        throw badRequest(`${fieldName} must be a JSON array`, 'invalid_array');
      }
    } else {
      value = [trimmed];
    }
  }
  if (!Array.isArray(value)) {
    throw badRequest(`${fieldName} must be an array`, 'invalid_array');
  }
  const out = [];
  for (const item of value) {
    const s = String(item || '').trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

// Validate the Company → Product → Order chain. orderId is REQUIRED for QC reports.
async function validateChain({ orderId, productId, customerId }) {
  for (const [key, value] of Object.entries({ orderId, productId, customerId })) {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw badRequest(`Invalid ${key}`, 'invalid_id');
    }
  }
  const order = await Order.findById(orderId);
  if (!order) throw badRequest('orderId does not reference an existing order', 'invalid_order');
  if (order.productId.toString() !== String(productId)) {
    throw badRequest('productId does not match the order', 'product_order_mismatch');
  }
  if (order.customerId.toString() !== String(customerId)) {
    throw badRequest('customerId does not match the order', 'customer_order_mismatch');
  }
  return order;
}

// Shape a QC report for client responses. Handles `photos` populated or raw.
function toPublicReport(report) {
  const photos = (report.photos || []).map((p) =>
    p && p.url
      ? { id: p._id.toString(), url: p.url, type: p.type, mimeType: p.mimeType, sizeBytes: p.sizeBytes }
      : { id: p.toString() }
  );
  return {
    id: report._id.toString(),
    department: report.department,
    customerId: report.customerId.toString(),
    productId: report.productId.toString(),
    orderId: report.orderId.toString(),
    machine: report.machine || null,
    mould: report.mould || null,
    part: report.part || null,
    shift: report.shift || null,
    defects: report.defects || [],
    severity: report.severity,
    description: report.description || null,
    tags: report.tags || [],
    photos,
    status: report.status,
    comments: (report.comments || []).map((c) => ({
      id: c._id ? c._id.toString() : undefined,
      authorId: c.authorId ? c.authorId.toString() : null,
      authorName: c.authorName || null,
      authorRole: c.authorRole || null,
      text: c.text,
      createdAt: c.createdAt,
    })),
    statusHistory: (report.statusHistory || []).map((h) => ({
      status: h.status,
      byId: h.byId ? h.byId.toString() : null,
      byName: h.byName || null,
      note: h.note || null,
      at: h.at,
    })),
    submittedBy: report.submittedBy.toString(),
    submittedByName: report.submittedByName || null,
    closedAt: report.closedAt || null,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

// Physically delete a report's images: unlink the binaries on disk AND remove their
// `mediaassets` rows, then clear the report's photo references. Used when a QC case is
// closed — the comments/history stay, only the images (which consume storage) are purged.
// Safe to call more than once; a report with no photos is a no-op.
async function deleteReportPhotos(report) {
  const photoIds = (report.photos || []).map((p) => (p && p._id ? p._id : p)).filter(Boolean);
  if (photoIds.length === 0) return;

  const { diskPathForUrl } = require('../middleware/upload');
  const assets = await MediaAsset.find({ _id: { $in: photoIds } });
  await Promise.all(
    assets.map(async (a) => {
      const disk = diskPathForUrl(a.url);
      if (!disk) return;
      try {
        await fs.promises.unlink(disk);
      } catch (e) {
        /* file already gone — nothing to reclaim */
      }
    })
  );
  await MediaAsset.deleteMany({ _id: { $in: photoIds } });
  report.photos = [];
}

async function userName(userId) {
  const u = await User.findById(userId).select('name role').lean();
  return u ? { name: u.name, role: u.role } : { name: null, role: null };
}

// Persist any brand-new defect names so they become permanently available everywhere.
async function rememberDefects(defects, userId) {
  if (!defects || defects.length === 0) return;
  await Promise.all(
    defects.map((name) =>
      QCDefectType.updateOne(
        { name },
        { $setOnInsert: { name, createdBy: userId || null } },
        { upsert: true, collation: { locale: 'en', strength: 2 } }
      ).catch(() => {}) // ignore duplicate-key races
    )
  );
}

// ---------------------------------------------------------------------------
// Defect types
// ---------------------------------------------------------------------------

// Lazy-seed the default palette the first time the list is read/empty.
async function ensureSeeded() {
  const count = await QCDefectType.estimatedDocumentCount();
  if (count > 0) return;
  try {
    await QCDefectType.insertMany(
      QCDefectType.DEFAULTS.map((name) => ({ name })),
      { ordered: false }
    );
  } catch (e) {
    /* races / duplicates are fine */
  }
}

async function listDefectTypes() {
  await ensureSeeded();
  const docs = await QCDefectType.find().collation({ locale: 'en', strength: 2 }).sort({ name: 1 }).lean();
  return docs.map((d) => d.name);
}

async function addDefectType(name, userId) {
  const clean = String(name || '').trim();
  if (!clean) throw badRequest('Defect name is required', 'invalid_defect');
  await rememberDefects([clean], userId);
  return listDefectTypes();
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

async function createReport({ payload, files, user }) {
  const department = assertDepartment(payload.department);
  const order = await validateChain(payload);

  // Archived PO (all Item Codes' production complete) is read-only — no more QC uploads.
  if (order.purchaseOrderId) {
    const po = await PurchaseOrder.findById(order.purchaseOrderId).select('status');
    if (po && po.status === 'Archived') {
      throw badRequest(
        'This purchase order is complete and archived — QC uploads are read-only.',
        'po_archived'
      );
    }
  }

  // Once "QC Done" has been pressed for this order + department, QC is locked
  // permanently — no further reports or images may be uploaded.
  if ((order.qcClosedDepartments || []).includes(department)) {
    throw badRequest('QC is completed for this order — uploads are locked', 'qc_locked');
  }

  const defects = parseStringArray(payload.defects, 'defects');
  const tags = parseStringArray(payload.tags, 'tags');

  const severity = String(payload.severity || 'minor').trim().toLowerCase();
  if (!SEVERITIES.includes(severity)) {
    throw badRequest(`severity must be one of: ${SEVERITIES.join(', ')}`, 'invalid_severity');
  }

  const { name: authorName, role: authorRole } = await userName(user.id);
  const shift = resolveShift(payload.shift);

  const report = await QCReport.create({
    department,
    customerId: payload.customerId,
    productId: payload.productId,
    orderId: payload.orderId,
    machine: payload.machine ? String(payload.machine).trim() : undefined,
    mould: payload.mould ? String(payload.mould).trim() : undefined,
    part: payload.part ? String(payload.part).trim() : undefined,
    shift,
    defects,
    severity,
    description: payload.description ? String(payload.description).trim() : undefined,
    tags,
    status: 'open',
    statusHistory: [{ status: 'open', byId: user.id, byName: authorName, note: 'Report created' }],
    submittedBy: user.id,
    submittedByName: authorName,
  });

  // Attach uploaded photos (record first, then media, then link).
  if (files && files.length > 0) {
    const { publicUrlFor } = require('../middleware/upload');
    const media = await MediaAsset.insertMany(
      files.map((f) => ({
        type: 'image',
        url: publicUrlFor(f.path),
        mimeType: f.mimetype,
        sizeBytes: f.size,
        ownerType: 'qc',
        ownerId: report._id,
        uploadedBy: user.id,
      }))
    );
    report.photos = media.map((m) => m._id);
    await report.save();
    report.photos = media;
  }

  // Persist any brand-new defect names for future reports (app-wide).
  await rememberDefects(defects, user.id);

  // Notify Admin (in-app). customerId/orderId make customer notifications trivial later.
  await QCNotification.create({
    reportId: report._id,
    department,
    customerId: order.customerId,
    productId: order.productId,
    orderId: order._id,
    forRole: 'admin',
    severity,
    message: `New ${severity} QC defect (${department}) on ${order.orderCode || 'order'}${
      defects.length ? ` — ${defects.slice(0, 3).join(', ')}` : ''
    }`,
  });

  return { report: toPublicReport(report) };
}

// ---------------------------------------------------------------------------
// List / get / search
// ---------------------------------------------------------------------------

function buildFilter(query) {
  const filter = {};
  if (query.department) filter.department = assertDepartment(query.department);
  for (const key of ['customerId', 'productId', 'orderId', 'submittedBy']) {
    if (query[key]) {
      if (!mongoose.Types.ObjectId.isValid(query[key])) {
        throw badRequest(`Invalid ${key}`, 'invalid_id');
      }
      filter[key] = query[key];
    }
  }
  if (query.status) filter.status = query.status;
  if (query.severity) filter.severity = query.severity;
  if (query.machine) filter.machine = query.machine;
  if (query.mould) filter.mould = query.mould;
  if (query.defect) filter.defects = query.defect;

  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo);
  }

  // Free-text search across the stored string fields (machine / mould / part /
  // description / defects / engineer name). Company/Product/Order are filtered by id above.
  if (query.search && String(query.search).trim()) {
    const rx = new RegExp(String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { machine: rx }, { mould: rx }, { part: rx },
      { description: rx }, { defects: rx }, { submittedByName: rx },
    ];
  }
  return filter;
}

async function listReports(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildFilter(query);
  const [items, total] = await Promise.all([
    QCReport.find(filter).populate('photos').sort({ createdAt: -1 }).skip(skip).limit(limit),
    QCReport.countDocuments(filter),
  ]);
  const data = items.map(toPublicReport);

  // Enrich the page with human-readable Company / Product / Order labels so lists (esp. the
  // Admin QC browser, req #6) don't show raw ObjectIds.
  if (data.length > 0) {
    const orderIds = [...new Set(data.map((d) => d.orderId))];
    const customerIds = [...new Set(data.map((d) => d.customerId))];
    const productIds = [...new Set(data.map((d) => d.productId))];
    const [orders, customers, products] = await Promise.all([
      Order.find({ _id: { $in: orderIds } }).select('orderCode').lean(),
      Customer.find({ _id: { $in: customerIds } }).select('name').lean(),
      Product.find({ _id: { $in: productIds } }).select('name itemCode').lean(),
    ]);
    const orderCode = new Map(orders.map((o) => [String(o._id), o.orderCode || null]));
    const cName = new Map(customers.map((c) => [String(c._id), c.name]));
    const pName = new Map(products.map((p) => [String(p._id), p.name]));
    const pItem = new Map(products.map((p) => [String(p._id), p.itemCode || null]));
    for (const d of data) {
      d.orderCode = orderCode.get(d.orderId) ?? null;
      d.customerName = cName.get(d.customerId) ?? null;
      d.productName = pName.get(d.productId) ?? null;
      d.itemCode = pItem.get(d.productId) ?? null;
    }
  }
  return buildList(data, total, page, limit);
}

async function getReport(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid id', 'invalid_id');
  const report = await QCReport.findById(id).populate('photos');
  if (!report) throw notFound('QC report not found', 'qc_report_not_found');
  return toPublicReport(report);
}

// ---------------------------------------------------------------------------
// Status + comments
// ---------------------------------------------------------------------------

async function updateStatus(id, status, note, user) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid id', 'invalid_id');
  if (!STATUSES.includes(status)) {
    throw badRequest(`status must be one of: ${STATUSES.join(', ')}`, 'invalid_status');
  }
  const report = await QCReport.findById(id).populate('photos');
  if (!report) throw notFound('QC report not found', 'qc_report_not_found');

  const wasClosed = report.status === 'closed';
  const { name } = await userName(user.id);
  report.status = status;
  report.statusHistory.push({
    status,
    byId: user.id,
    byName: name,
    note: note ? String(note).trim() : undefined,
  });

  if (status === 'closed') {
    // Closing purges the case's images from storage (comments/history are kept).
    if (!wasClosed) await deleteReportPhotos(report);
    report.closedAt = report.closedAt || new Date();
  } else {
    report.closedAt = null;
  }

  await report.save();
  return toPublicReport(report);
}

async function addComment(id, text, user) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid id', 'invalid_id');
  const clean = String(text || '').trim();
  if (!clean) throw badRequest('Comment text is required', 'invalid_comment');
  const report = await QCReport.findById(id).populate('photos');
  if (!report) throw notFound('QC report not found', 'qc_report_not_found');

  const { name, role } = await userName(user.id);
  report.comments.push({ authorId: user.id, authorName: name, authorRole: role, text: clean });
  await report.save();
  return toPublicReport(report);
}

// ---------------------------------------------------------------------------
// Order QC Dashboard context (reuses existing production status services)
// ---------------------------------------------------------------------------

async function orderContext({ orderId, department }) {
  assertDepartment(department);
  if (!mongoose.Types.ObjectId.isValid(orderId)) throw badRequest('Invalid orderId', 'invalid_id');
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Order not found', 'order_not_found');

  const [customer, product] = await Promise.all([
    Customer.findById(order.customerId).select('name').lean(),
    Product.findById(order.productId).select('name itemCode').lean(),
  ]);

  // Production progress from the department's own status service.
  const prod =
    department === 'assembly'
      ? await assemblyService.computeOrderStatus(orderId)
      : await mouldingService.computeOrderStatus(orderId);

  // Machines + moulds actually used on this order (distinct values from records).
  const [machines, moulds] = await Promise.all([
    department === 'assembly'
      ? AssemblyRecord.distinct('assemblyLine', { orderId: order._id })
      : MouldingRecord.distinct('machineNumber', { orderId: order._id }),
    MouldingRecord.distinct('moldName', { orderId: order._id }),
  ]);

  // QC report counts + latest activity for this order + department.
  const match = { orderId: order._id, department };
  const [counts, latest] = await Promise.all([
    QCReport.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $in: ['$status', ['open', 'investigating']] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
          critical: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
        },
      },
    ]),
    QCReport.find(match).sort({ createdAt: -1 }).limit(5).populate('photos').lean(),
  ]);
  const c = counts[0] || { total: 0, open: 0, resolved: 0, critical: 0 };

  return {
    order: {
      id: order._id.toString(),
      orderCode: order.orderCode || null,
      orderQuantity: order.orderQuantity,
      customerId: order.customerId.toString(),
      productId: order.productId.toString(),
      customerName: customer?.name || null,
      productName: product?.name || null,
      itemCode: product?.itemCode || null,
      productionStatus: order.productionStatus,
      assemblyStatus: order.assemblyStatus,
    },
    department,
    progress: {
      status: prod.status,
      progressPct: prod.progressPct,
      producedQuantity: department === 'assembly' ? prod.assembledQuantity : prod.goodParts,
      targetQuantity: prod.orderQuantity,
    },
    machines: machines.filter(Boolean),
    moulds: moulds.filter(Boolean),
    counts: { total: c.total, open: c.open, resolved: c.resolved, critical: c.critical },
    latest: latest.map((r) =>
      toPublicReport(r)
    ),
  };
}

// ---------------------------------------------------------------------------
// Active QC orders (req #11) — the orders shown inside a department's QC tab.
// ---------------------------------------------------------------------------
//
// An order stays in a department's QC list as long as that department has touched it
// (mould setup / production / assembly / an existing QC report) AND the engineer has NOT
// pressed "Done Uploading QC Photos" for it. Production completion never removes it —
// engineers document defects during, right after, and while inspecting production.
// Shared lister for a department's QC item codes. `archived=false` returns the ACTIVE list
// (item codes still being documented); `archived=true` returns the ARCHIVED list (item codes
// the engineer has pressed "Done Uploading QC Photos" / "QC Done" for). Reports stay visible
// either way — archiving only moves the item code between the two tabs.
async function listDeptOrders({ department, archived = false }) {
  assertDepartment(department);

  // Orders (item code jobs) this department is involved in.
  const idQueries = [QCReport.distinct('orderId', { department })];
  if (department === 'assembly') {
    idQueries.push(AssemblyRecord.distinct('orderId'));
  } else {
    idQueries.push(OrderMold.distinct('orderId'));
    idQueries.push(MouldingRecord.distinct('orderId'));
  }
  const idGroups = await Promise.all(idQueries);
  const idSet = new Set();
  for (const group of idGroups) for (const id of group) idSet.add(String(id));
  if (idSet.size === 0) return { orders: [] };
  const ids = [...idSet].map((s) => new mongoose.Types.ObjectId(s));

  const orders = await Order.find({
    _id: { $in: ids },
    qcClosedDepartments: archived ? department : { $ne: department },
  }).lean();
  if (orders.length === 0) return { orders: [] };

  const [customers, products, reportAgg] = await Promise.all([
    Customer.find({ _id: { $in: orders.map((o) => o.customerId) } }).select('name').lean(),
    Product.find({ _id: { $in: orders.map((o) => o.productId) } }).select('name itemCode').lean(),
    QCReport.aggregate([
      { $match: { department, orderId: { $in: orders.map((o) => o._id) } } },
      {
        $group: {
          _id: '$orderId',
          count: { $sum: 1 },
          lastAt: { $max: '$createdAt' },
          open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const cName = new Map(customers.map((c) => [String(c._id), c.name]));
  const pMap = new Map(products.map((p) => [String(p._id), p]));
  const rMap = new Map(reportAgg.map((r) => [String(r._id), r]));

  const rows = orders.map((o) => {
    const r = rMap.get(String(o._id)) || { count: 0, lastAt: null, open: 0 };
    const p = pMap.get(String(o.productId));
    return {
      id: String(o._id),
      orderCode: o.orderCode || null,
      purchaseOrderId: o.purchaseOrderId ? String(o.purchaseOrderId) : null,
      customerId: String(o.customerId),
      productId: String(o.productId),
      customerName: cName.get(String(o.customerId)) || null,
      productName: p ? p.name : null,
      itemCode: p ? p.itemCode || null : null,
      orderQuantity: o.orderQuantity,
      productionStatus: o.productionStatus,
      productionComplete: o.productionStatus === 'Completed',
      reportCount: r.count,
      openCount: r.open,
      lastReportAt: r.lastAt || null,
    };
  });
  // Most recently documented first, then most recently updated item codes.
  rows.sort((a, b) => {
    const at = a.lastReportAt ? new Date(a.lastReportAt).getTime() : 0;
    const bt = b.lastReportAt ? new Date(b.lastReportAt).getTime() : 0;
    return bt - at;
  });
  return { orders: rows };
}

function listActiveOrders({ department }) {
  return listDeptOrders({ department, archived: false });
}

function listArchivedOrders({ department }) {
  return listDeptOrders({ department, archived: true });
}

// ---------------------------------------------------------------------------
// PO-level QC lists (req #12/#13) — the Moulding QC screen works at PO level.
// A PO is ACTIVE for a department while ANY of its involved item-code jobs is not yet
// qc-closed for that department; ARCHIVED once EVERY involved job is qc-closed.
// ---------------------------------------------------------------------------
async function listDeptPOs({ department, archived = false }) {
  assertDepartment(department);

  // Item-code jobs this department is involved in.
  const idQueries = [QCReport.distinct('orderId', { department })];
  if (department === 'assembly') {
    idQueries.push(AssemblyRecord.distinct('orderId'));
  } else {
    idQueries.push(OrderMold.distinct('orderId'));
    idQueries.push(MouldingRecord.distinct('orderId'));
  }
  const idGroups = await Promise.all(idQueries);
  const idSet = new Set();
  for (const group of idGroups) for (const id of group) idSet.add(String(id));
  if (idSet.size === 0) return { purchaseOrders: [] };
  const ids = [...idSet].map((s) => new mongoose.Types.ObjectId(s));

  const orders = await Order.find({ _id: { $in: ids }, purchaseOrderId: { $ne: null } })
    .select('purchaseOrderId customerId qcClosedDepartments')
    .lean();
  if (orders.length === 0) return { purchaseOrders: [] };

  // Group involved jobs by PO; classify by whether all involved jobs are qc-closed.
  const byPo = new Map();
  const orderToPo = new Map();
  for (const o of orders) {
    const pid = String(o.purchaseOrderId);
    orderToPo.set(String(o._id), pid);
    if (!byPo.has(pid)) byPo.set(pid, { total: 0, closed: 0 });
    const g = byPo.get(pid);
    g.total += 1;
    if ((o.qcClosedDepartments || []).includes(department)) g.closed += 1;
  }
  const wantPoIds = [];
  for (const [pid, g] of byPo) {
    const allClosed = g.total > 0 && g.closed === g.total;
    if (archived ? allClosed : !allClosed) wantPoIds.push(pid);
  }
  if (wantPoIds.length === 0) return { purchaseOrders: [] };
  const wantObjIds = wantPoIds.map((s) => new mongoose.Types.ObjectId(s));

  const [poDocs, reportAgg, totalJobsAgg] = await Promise.all([
    PurchaseOrder.find({ _id: { $in: wantObjIds } }).lean(),
    QCReport.aggregate([
      { $match: { department, orderId: { $in: ids } } },
      {
        $group: {
          _id: '$orderId',
          count: { $sum: 1 },
          open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
          lastAt: { $max: '$createdAt' },
        },
      },
    ]),
    // Total item-code jobs in each PO (for display — not just the QC-involved ones).
    Order.aggregate([
      { $match: { purchaseOrderId: { $in: wantObjIds } } },
      { $group: { _id: '$purchaseOrderId', total: { $sum: 1 } } },
    ]),
  ]);
  const totalJobsByPo = new Map(totalJobsAgg.map((r) => [String(r._id), r.total]));
  const customers = await Customer.find({ _id: { $in: [...new Set(poDocs.map((p) => String(p.customerId)))] } })
    .select('name')
    .lean();
  const cName = new Map(customers.map((c) => [String(c._id), c.name]));

  // Roll report counts up to the PO.
  const poReport = new Map();
  for (const r of reportAgg) {
    const pid = orderToPo.get(String(r._id));
    if (!pid) continue;
    if (!poReport.has(pid)) poReport.set(pid, { count: 0, open: 0, lastAt: null });
    const g = poReport.get(pid);
    g.count += r.count;
    g.open += r.open;
    if (r.lastAt && (!g.lastAt || new Date(r.lastAt) > new Date(g.lastAt))) g.lastAt = r.lastAt;
  }

  const rows = poDocs.map((po) => {
    const rep = poReport.get(String(po._id)) || { count: 0, open: 0, lastAt: null };
    return {
      id: String(po._id),
      poNumber: po.poNumber || null,
      customerId: String(po.customerId),
      customerName: cName.get(String(po.customerId)) || null,
      itemCount: totalJobsByPo.get(String(po._id)) || 0,
      reportCount: rep.count,
      openCount: rep.open,
      lastReportAt: rep.lastAt || null,
    };
  });
  rows.sort((a, b) => {
    const at = a.lastReportAt ? new Date(a.lastReportAt).getTime() : 0;
    const bt = b.lastReportAt ? new Date(b.lastReportAt).getTime() : 0;
    return bt - at;
  });
  return { purchaseOrders: rows };
}

function listActivePOs({ department }) {
  return listDeptPOs({ department, archived: false });
}
function listArchivedPOs({ department }) {
  return listDeptPOs({ department, archived: true });
}

// "Done with Moulding QC for this PO" — mark every job in the PO qc-closed for the
// department, moving the whole PO to QC Archive. Idempotent.
async function closePO({ purchaseOrderId, department }) {
  assertDepartment(department);
  if (!mongoose.Types.ObjectId.isValid(purchaseOrderId)) {
    throw badRequest('Invalid purchaseOrderId', 'invalid_id');
  }
  const jobs = await Order.find({ purchaseOrderId });
  if (jobs.length === 0) throw notFound('Purchase order not found', 'purchase_order_not_found');
  let closed = 0;
  for (const job of jobs) {
    if (!job.qcClosedDepartments.includes(department)) {
      job.qcClosedDepartments.push(department);
      await job.save();
      closed += 1;
    }
  }
  return { purchaseOrderId: String(purchaseOrderId), department, closedJobs: closed, totalJobs: jobs.length };
}

// Mark QC documentation finished for one order + department (the "Done Uploading QC
// Photos" button). Removes it from the active QC list; reports stay visible to Admin +
// customer. Idempotent.
async function closeOrder({ orderId, department }) {
  assertDepartment(department);
  if (!mongoose.Types.ObjectId.isValid(orderId)) throw badRequest('Invalid orderId', 'invalid_id');
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Order not found', 'order_not_found');
  if (!order.qcClosedDepartments.includes(department)) {
    order.qcClosedDepartments.push(department);
    await order.save();
  }
  return {
    orderId: String(order._id),
    department,
    qcClosedDepartments: order.qcClosedDepartments,
  };
}

// ---------------------------------------------------------------------------
// Summary (charts)
// ---------------------------------------------------------------------------

async function summary({ orderId, department }) {
  assertDepartment(department);
  if (!mongoose.Types.ObjectId.isValid(orderId)) throw badRequest('Invalid orderId', 'invalid_id');
  const match = { orderId: new mongoose.Types.ObjectId(String(orderId)), department };

  const [totals, byDefect, byMachine, byMould] = await Promise.all([
    QCReport.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $in: ['$status', ['open', 'investigating']] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          critical: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
        },
      },
    ]),
    QCReport.aggregate([
      { $match: match },
      { $unwind: '$defects' },
      { $group: { _id: '$defects', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    QCReport.aggregate([
      { $match: { ...match, machine: { $nin: [null, ''] } } },
      { $group: { _id: '$machine', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    QCReport.aggregate([
      { $match: { ...match, mould: { $nin: [null, ''] } } },
      { $group: { _id: '$mould', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const t = totals[0] || { total: 0, open: 0, resolved: 0, rejected: 0, critical: 0 };
  const shape = (arr) => arr.map((x) => ({ label: x._id, count: x.count }));
  return {
    totals: { total: t.total, open: t.open, resolved: t.resolved, rejected: t.rejected, critical: t.critical },
    mostCommonDefects: shape(byDefect),
    defectsByMachine: shape(byMachine),
    defectsByMould: shape(byMould),
  };
}

// ---------------------------------------------------------------------------
// Notifications (Admin)
// ---------------------------------------------------------------------------

async function listNotifications(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { forRole: 'admin' };
  if (query.unread === 'true' || query.unread === true) filter.isRead = false;

  const [items, total, unreadCount] = await Promise.all([
    QCNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    QCNotification.countDocuments(filter),
    QCNotification.countDocuments({ forRole: 'admin', isRead: false }),
  ]);
  const data = items.map((n) => ({
    id: n._id.toString(),
    reportId: n.reportId.toString(),
    department: n.department,
    customerId: n.customerId.toString(),
    orderId: n.orderId.toString(),
    severity: n.severity,
    message: n.message,
    isRead: n.isRead,
    createdAt: n.createdAt,
  }));
  return { ...buildList(data, total, page, limit), unreadCount };
}

async function markNotificationRead(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid id', 'invalid_id');
  const n = await QCNotification.findByIdAndUpdate(id, { isRead: true }, { new: true });
  if (!n) throw notFound('Notification not found', 'notification_not_found');
  return { id: n._id.toString(), isRead: n.isRead };
}

module.exports = {
  createReport,
  listReports,
  getReport,
  updateStatus,
  addComment,
  orderContext,
  listActiveOrders,
  listArchivedOrders,
  listActivePOs,
  listArchivedPOs,
  closePO,
  closeOrder,
  summary,
  listDefectTypes,
  addDefectType,
  listNotifications,
  markNotificationRead,
  toPublicReport,
};
