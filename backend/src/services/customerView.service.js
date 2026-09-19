'use strict';

const mongoose = require('mongoose');
const Order = require('../models/Order');
const PurchaseOrder = require('../models/PurchaseOrder');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const MouldingRecord = require('../models/MouldingRecord');
const AssemblyRecord = require('../models/AssemblyRecord');
const QCRecord = require('../models/QCRecord');
const QCReport = require('../models/QCReport');
const PackingDispatchRecord = require('../models/PackingDispatchRecord');

const OrderMold = require('../models/OrderMold');

const mouldingService = require('./moulding.service');
const assemblyService = require('./assembly.service');
const qcService = require('./qc.service');
const dispatchService = require('./dispatch.service');
const storeService = require('./store.service');

const { notFound, forbidden, badRequest } = require('../utils/httpError');
const { parsePagination, buildList } = require('../utils/pagination');
const { DELAYED_AFTER_DAYS, DAY_MS } = require('../utils/sla');

// Phase 8 — Customer dashboard (Module 5). STRICTLY READ-ONLY: this service never
// creates, updates or deletes anything. Every query is scoped to the calling
// customer's own customerId, so a customer can only ever see their own data.
//
// Two model facts shape the customer-visible shapes below:
//   - orders have no dedicated `orderNumber` field → a friendly number is derived
//     from the id (`ORD-XXXXXX`); the raw id is also returned for API calls.
//   - orders have no due/delivery date → "Delayed" cannot be deadline-based, so it
//     is an SLA heuristic: an order still open after DELAYED_AFTER_DAYS counts as
//     delayed. Tune the constant (or wire it to env/master-data) when a real SLA
//     or promised-delivery date becomes available (see utils/sla.js).

// ---------------------------------------------------------------------------
// Scoping + ownership helpers
// ---------------------------------------------------------------------------

// Every customer token must carry a customerId (enforced at signup/login). Reject
// defensively if it is missing so a misconfigured account can never see all data.
function customerScope(user) {
  if (!user || !user.customerId) {
    throw forbidden('This account is not linked to a customer', 'missing_customer_scope');
  }
  return new mongoose.Types.ObjectId(user.customerId);
}

// Load an order that MUST belong to this customer. Scoping by both _id and
// customerId means another customer's order id resolves to null → 404 (no leak
// of whether the order exists for someone else).
async function loadOwnedOrder(orderId, customerId) {
  const order = await Order.findOne({ _id: orderId, customerId });
  if (!order) {
    throw notFound('Order not found', 'order_not_found');
  }
  return order;
}

// Friendly, human-readable order reference derived from the ObjectId.
function formatOrderNumber(id) {
  return `ORD-${id.toString().slice(-6).toUpperCase()}`;
}

// Map a populated MediaAsset to the public, customer-safe media shape (internal
// owner/uploader fields are intentionally stripped).
function toMedia(asset) {
  if (!asset || !asset.url) return null;
  return {
    id: asset._id.toString(),
    url: asset.url,
    type: asset.type,
    mimeType: asset.mimeType || null,
    sizeBytes: asset.sizeBytes || null,
  };
}

// ---------------------------------------------------------------------------
// GET /customer/dashboard — order counters across all of this customer's orders
// ---------------------------------------------------------------------------
//
// Aggregates fulfillment (shipped quantity) per order from packingdispatchrecords:
//   Total      → every order belonging to the customer
//   Completed  → fully shipped (dispatched quantity >= ordered quantity)
//   Active     → not yet completed (= Total − Completed)
//   Delayed    → an *active* order open longer than DELAYED_AFTER_DAYS (subset of Active)
async function getDashboard(user) {
  const customerId = customerScope(user);

  const rows = await Order.aggregate([
    { $match: { customerId } },
    {
      // Sum dispatched (packed) quantity per order — fulfillment against the order.
      $lookup: {
        from: PackingDispatchRecord.collection.name,
        let: { oid: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$orderId', '$$oid'] } } },
          { $group: { _id: null, dispatched: { $sum: '$packedQuantity' } } },
        ],
        as: 'dispatch',
      },
    },
    {
      $addFields: {
        dispatchedQuantity: { $ifNull: [{ $arrayElemAt: ['$dispatch.dispatched', 0] }, 0] },
      },
    },
    { $project: { orderQuantity: 1, createdAt: 1, dispatchedQuantity: 1 } },
  ]);

  const nowMs = Date.now();
  const delayedThresholdMs = DELAYED_AFTER_DAYS * DAY_MS;

  let total = 0;
  let completed = 0;
  let delayed = 0;

  for (const o of rows) {
    total += 1;
    const isCompleted = o.orderQuantity > 0 && o.dispatchedQuantity >= o.orderQuantity;
    if (isCompleted) {
      completed += 1;
    } else {
      const ageMs = nowMs - new Date(o.createdAt).getTime();
      if (ageMs > delayedThresholdMs) delayed += 1;
    }
  }

  return {
    totalOrders: total,
    activeOrders: total - completed,
    completedOrders: completed,
    delayedOrders: delayed,
    // Surface the rule so the client (and auditors) know what "delayed" means here.
    delayedPolicy: { type: 'sla_age', thresholdDays: DELAYED_AFTER_DAYS },
  };
}

// ---------------------------------------------------------------------------
// GET /customer/orders — paginated list of this customer's orders with a summary
// ---------------------------------------------------------------------------
//
// A single aggregation joins the product plus per-department production sums so the
// list shows an end-to-end fulfillment summary without N round-trips. Detailed
// per-department status/percentages live on /customer/orders/:id/progress.
function sumLookup(model, field, as) {
  return {
    $lookup: {
      from: model.collection.name,
      let: { oid: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$orderId', '$$oid'] } } },
        { $group: { _id: null, total: { $sum: `$${field}` }, count: { $sum: 1 }, lastAt: { $max: '$createdAt' } } },
      ],
      as,
    },
  };
}

// Centralized QC sign-off: the customer's QC stage is 100% done ONLY when the QC engineer
// has closed BOTH the Moulding and Assembly QC departments (see getOrderDashboard). This is
// the single source of truth for "QC complete" — the legacy QCRecord accepted quantity does
// NOT drive customer QC progress.
function isQcSignedOff(closedDepartments) {
  const c = closedDepartments || [];
  return c.includes('moulding') && c.includes('assembly');
}

// Customer-facing overall stage, derived from how far production has progressed.
//
// A stage that has reached 100% has handed its goods to the NEXT stage, so the customer sees
// the work advance even before that next stage has logged its first record — e.g. once Moulding
// is fully done the order reads "In Assembly", once Assembly is done it reads "In QC", and once
// QC is signed off it reads "Dispatching". It never stays stuck on a stage that has already
// hit 100%. Completion is measured in good pieces against the order quantity (moulding/assembly)
// and by the centralized QC sign-off (`qcDone` / `qcClosedDepartments`). Record-count-only
// callers still get the classic "furthest stage with records" answer.
function deriveOverallStatus(o) {
  const qty = o.orderQuantity || 0;
  const mouldingGood = o.mouldingGood || 0;
  const assemblyGood = o.assemblyGood || 0;
  // Prefer an explicit rolled-up flag (PO-level callers); otherwise derive from this order's
  // own closed-departments list.
  const qcDone = o.qcDone != null ? o.qcDone : isQcSignedOff(o.qcClosedDepartments);

  if (qty > 0 && o.dispatchedQuantity >= qty) return 'Completed';
  if (o.dispatchCount > 0) return 'Dispatching';
  // QC signed off (both departments closed) → handed to Dispatch.
  if (qcDone) return 'Dispatching';
  if (o.qcCount > 0) return 'In QC';
  // Assembly fully built → waiting for QC.
  if (qty > 0 && assemblyGood >= qty) return 'In QC';
  if (o.assemblyCount > 0) return 'In Assembly';
  // Moulding fully produced → handed to Assembly.
  if (qty > 0 && mouldingGood >= qty) return 'In Assembly';
  if (o.mouldingCount > 0) return 'In Moulding';
  return 'Pending';
}

async function listOrders(user, query = {}) {
  const customerId = customerScope(user);
  const { page, limit, skip } = parsePagination(query);

  const [items, total] = await Promise.all([
    Order.aggregate([
      { $match: { customerId } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      // Master-data join for the product name.
      {
        $lookup: {
          from: Product.collection.name,
          localField: 'productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      // Per-department production sums.
      sumLookup(MouldingRecord, 'goodParts', 'moulding'),
      sumLookup(AssemblyRecord, 'assembledQuantity', 'assembly'),
      sumLookup(QCRecord, 'acceptedQuantity', 'qc'),
      sumLookup(PackingDispatchRecord, 'packedQuantity', 'dispatch'),
      {
        $addFields: {
          mouldingCount: { $ifNull: [{ $arrayElemAt: ['$moulding.count', 0] }, 0] },
          assemblyCount: { $ifNull: [{ $arrayElemAt: ['$assembly.count', 0] }, 0] },
          assemblyGood: { $ifNull: [{ $arrayElemAt: ['$assembly.total', 0] }, 0] },
          qcCount: { $ifNull: [{ $arrayElemAt: ['$qc.count', 0] }, 0] },
          qcAccepted: { $ifNull: [{ $arrayElemAt: ['$qc.total', 0] }, 0] },
          dispatchCount: { $ifNull: [{ $arrayElemAt: ['$dispatch.count', 0] }, 0] },
          dispatchedQuantity: { $ifNull: [{ $arrayElemAt: ['$dispatch.total', 0] }, 0] },
        },
      },
      {
        $project: {
          orderQuantity: 1,
          createdAt: 1,
          productName: '$product.name',
          partName: '$product.partName',
          mouldingCount: 1,
          assemblyCount: 1,
          assemblyGood: 1,
          qcCount: 1,
          qcAccepted: 1,
          dispatchCount: 1,
          dispatchedQuantity: 1,
        },
      },
    ]),
    Order.countDocuments({ customerId }),
  ]);

  const data = items.map((o) => {
    const qty = o.orderQuantity || 0;
    return {
      id: o._id.toString(),
      orderNumber: formatOrderNumber(o._id),
      product: o.productName || null,
      partName: o.partName || null,
      orderQuantity: o.orderQuantity,
      dispatchedQuantity: o.dispatchedQuantity,
      progressPct: qty > 0 ? Math.min(100, Math.round((o.dispatchedQuantity / qty) * 100)) : 0,
      status: deriveOverallStatus(o),
      createdAt: o.createdAt,
    };
  });

  return buildList(data, total, page, limit);
}

// ---------------------------------------------------------------------------
// GET /customer/orders/:id — full order detail (details + QC & dispatch summaries + photos)
// ---------------------------------------------------------------------------

// Defect summary grouped by defect type across the order's QC records.
async function defectSummary(orderId, customerId) {
  return QCRecord.aggregate([
    { $match: { orderId: new mongoose.Types.ObjectId(orderId), customerId } },
    { $unwind: '$defects' },
    {
      $group: {
        _id: '$defects.defectType',
        quantity: { $sum: '$defects.quantity' },
      },
    },
    { $project: { _id: 0, defectType: '$_id', quantity: 1 } },
    { $sort: { quantity: -1 } },
  ]);
}

// Accepted / rejected totals for the order's QC records.
async function qcTotals(orderId, customerId) {
  const [agg] = await QCRecord.aggregate([
    { $match: { orderId: new mongoose.Types.ObjectId(orderId), customerId } },
    {
      $group: {
        _id: null,
        accepted: { $sum: '$acceptedQuantity' },
        rejected: { $sum: '$rejectedQuantity' },
        inspected: { $sum: '$sampleSize' },
      },
    },
  ]);
  return agg || { accepted: 0, rejected: 0, inspected: 0 };
}

// Build the QC summary block (Accepted, Rejected, Defect Summary, Corrective Actions).
async function buildQcSummary(orderId, customerId) {
  const [totals, defects, actionDocs] = await Promise.all([
    qcTotals(orderId, customerId),
    defectSummary(orderId, customerId),
    QCRecord.find({
      orderId,
      customerId,
      correctiveAction: { $nin: [null, ''] },
    })
      .select('inspectionDate correctiveAction')
      .sort({ inspectionDate: -1 })
      .lean(),
  ]);

  return {
    acceptedQuantity: totals.accepted,
    rejectedQuantity: totals.rejected,
    inspectedQuantity: totals.inspected,
    defectSummary: defects, // [{ defectType, quantity }]
    correctiveActions: actionDocs.map((d) => ({
      inspectionDate: d.inspectionDate,
      correctiveAction: d.correctiveAction,
    })),
  };
}

// Build the dispatch summary block. An order may ship in multiple consignments, so
// every shipment's customer-visible fields are listed plus rolled-up totals.
async function buildDispatchSummary(orderId, customerId) {
  const records = await PackingDispatchRecord.find({ orderId, customerId })
    .sort({ dispatchDate: 1 })
    .lean();

  const shipments = records.map((r) => ({
    dispatchDate: r.dispatchDate,
    packedQuantity: r.packedQuantity,
    cartonCount: r.cartonCount,
    transporter: r.transporterName,
    vehicleNumber: r.vehicleNumber,
    lrNumber: r.lrNumber,
    invoiceNumber: r.invoiceNumber,
  }));

  const totals = shipments.reduce(
    (acc, s) => {
      acc.packedQuantity += s.packedQuantity;
      acc.cartonCount += s.cartonCount;
      return acc;
    },
    { packedQuantity: 0, cartonCount: 0 }
  );

  return {
    shipmentCount: shipments.length,
    totalPackedQuantity: totals.packedQuantity,
    totalCartonCount: totals.cartonCount,
    firstDispatchDate: shipments.length ? shipments[0].dispatchDate : null,
    lastDispatchDate: shipments.length ? shipments[shipments.length - 1].dispatchDate : null,
    shipments,
  };
}

// Gather customer-viewable photos from all four departments for the order. Records
// are queried scoped to the customer (defense in depth) and their media populated.
async function collectPhotos(orderId, customerId) {
  const scope = { orderId, customerId };
  const [moulding, assembly, qc, dispatch] = await Promise.all([
    MouldingRecord.find(scope).populate('imageId').lean(),
    AssemblyRecord.find(scope).populate('photos').lean(),
    QCRecord.find(scope).populate('photos').lean(),
    PackingDispatchRecord.find(scope).populate('photos').lean(),
  ]);

  const fromArray = (records) =>
    records.flatMap((r) => (r.photos || []).map(toMedia)).filter(Boolean);

  return {
    moulding: moulding.map((r) => toMedia(r.imageId)).filter(Boolean),
    assembly: fromArray(assembly),
    qc: fromArray(qc),
    dispatch: fromArray(dispatch),
  };
}

async function getOrderDetails(user, orderId) {
  const customerId = customerScope(user);
  const order = await loadOwnedOrder(orderId, customerId);

  const [customer, product, qcSummary, dispatchSummary, photos] = await Promise.all([
    Customer.findById(order.customerId).select('name').lean(),
    Product.findById(order.productId).select('name itemCode partName').lean(),
    buildQcSummary(order._id, customerId),
    buildDispatchSummary(order._id, customerId),
    collectPhotos(order._id, customerId),
  ]);

  return {
    order: {
      id: order._id.toString(),
      orderNumber: formatOrderNumber(order._id),
      customer: customer ? customer.name : null,
      product: product ? product.name : null,
      partName: product ? product.partName || null : null,
      orderQuantity: order.orderQuantity,
      createdAt: order.createdAt,
    },
    qcSummary,
    dispatchSummary,
    photos,
  };
}

// ---------------------------------------------------------------------------
// GET /customer/orders/:id/progress — manufacturing progress across departments
// ---------------------------------------------------------------------------
//
// Reuses each department service's computeOrderStatus so the percentages and
// status rules stay identical to the engineer/admin views (single source of truth):
//   Moulding  good parts / order quantity
//   Assembly  assembled  / moulding good output
//   QC        inspected  / assembly good output      (+ Passed/Failed verdict)
//   Dispatch  dispatched / QC approved quantity
async function getOrderProgress(user, orderId) {
  const customerId = customerScope(user);
  // Ownership check first → another customer's order id is a clean 404, never computed.
  await loadOwnedOrder(orderId, customerId);

  const [moulding, assembly, qc, dispatch] = await Promise.all([
    mouldingService.computeOrderStatus(orderId),
    assemblyService.computeOrderStatus(orderId),
    qcService.computeOrderStatus(orderId),
    dispatchService.computeOrderStatus(orderId),
  ]);

  // Overall fulfillment is measured by shipped vs ordered (what the customer cares about).
  const overallPct = dispatch.progressPct;

  return {
    orderId: orderId.toString(),
    orderNumber: formatOrderNumber(orderId),
    orderQuantity: moulding.orderQuantity,
    overallProgressPct: overallPct,
    progress: {
      moulding: { status: moulding.status, progressPct: moulding.progressPct },
      assembly: { status: assembly.status, progressPct: assembly.progressPct },
      qc: { status: qc.status, progressPct: qc.progressPct },
      dispatch: { status: dispatch.status, progressPct: dispatch.progressPct },
    },
  };
}

// ---------------------------------------------------------------------------
// GET /customer/components — Component Store availability (this customer only)
// ---------------------------------------------------------------------------
//
// Read-only Product → Part → quantity view, scoped to the token's own customerId.
async function getComponentAvailability(user) {
  const customerId = customerScope(user);
  const tree = await storeService.getComponentStoreTree({ customerId: customerId.toString() });
  const mine = tree[0] || { products: [], totalQuantity: 0 };
  return {
    customerId: customerId.toString(),
    totalQuantity: mine.totalQuantity || 0,
    products: mine.products || [],
  };
}

// ---------------------------------------------------------------------------
// GET /customer/finished-goods — Finished Goods Store availability (this customer)
// ---------------------------------------------------------------------------
async function getFinishedGoods(user) {
  const customerId = customerScope(user);
  const tree = await storeService.getFinishedGoodsStoreTree({ customerId: customerId.toString() });
  const mine = tree[0] || { products: [], totalQuantity: 0 };
  return {
    customerId: customerId.toString(),
    totalQuantity: mine.totalQuantity || 0,
    products: mine.products || [],
  };
}

// ===========================================================================
// PRODUCT-FIRST customer portal (Home → Product → Order dashboard)
// ===========================================================================

const pct = (n, d) => (d > 0 ? Math.min(100, Math.round((n / d) * 100)) : 0);
// One-decimal percentage for rejection/quality rates.
const ratePct = (bad, total) => (total > 0 ? Math.round((bad / total) * 1000) / 10 : 0);

// Overall production progress = the progress of the FURTHEST pipeline stage that has
// started (req #9). `stages` is [{ started, pct }] in Moulding→Assembly→QC→Dispatch order.
// This is the single shared source of truth for the product cards, the order cards and
// the order dashboard header, so the overall bar always reflects live production and is
// never stuck at 0% just because nothing has shipped yet.
function overallProgress(stages) {
  let overall = 0;
  for (const s of stages) {
    if (s.started) overall = s.pct;
  }
  return overall;
}

// Customer-safe view of a QC defect report (internal ids / audit trail stripped).
function toCustomerDefectReport(report) {
  return {
    id: report._id.toString(),
    department: report.department,
    severity: report.severity,
    status: report.status,
    defects: report.defects || [],
    description: report.description || null,
    machine: report.machine || null,
    mould: report.mould || null,
    part: report.part || null,
    shift: report.shift || null,
    photos: (report.photos || []).map(toMedia).filter(Boolean),
    // The shared conversation (Admin / engineer / customer). Customers may read the whole
    // thread and add their own comments (see addQcComment) on their own orders.
    comments: (report.comments || []).map((c) => ({
      id: c._id ? c._id.toString() : undefined,
      authorName: c.authorName || null,
      authorRole: c.authorRole || null,
      text: c.text,
      createdAt: c.createdAt,
    })),
    createdAt: report.createdAt,
  };
}

// Customer-facing stage label for one department, from its progress.
function stageStatus(hasRecords, progressPct) {
  if (!hasRecords) return 'Not started';
  if (progressPct >= 100) return 'Completed';
  return 'In progress';
}

// Group a record collection by productId → { count, sum, lastAt }. `sumField` (optional)
// totals a production quantity so the caller can derive per-stage progress percentages.
async function countByProduct(model, customerId, sumField) {
  const rows = await model.aggregate([
    { $match: { customerId } },
    {
      $group: {
        _id: '$productId',
        count: { $sum: 1 },
        sum: { $sum: sumField ? `$${sumField}` : 0 },
        lastAt: { $max: '$createdAt' },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

// ---------------------------------------------------------------------------
// GET /customer/products — the Home grid: every product with a headline summary
// ---------------------------------------------------------------------------
async function getProducts(user) {
  const customerId = customerScope(user);

  const [customer, products] = await Promise.all([
    Customer.findById(customerId).select('name').lean(),
    Product.find({ customerId, status: { $ne: 'Archived' } }).sort({ name: 1 }).lean(),
  ]);
  const customerName = customer ? customer.name : null;
  if (products.length === 0) return { customer: customerName, products: [] };

  const [ordersAgg, dispatchAgg, mCount, aCount, qCount, dCount] = await Promise.all([
    Order.aggregate([
      { $match: { customerId } },
      {
        $group: {
          _id: '$productId',
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
          orderedQty: { $sum: '$orderQuantity' },
          lastOrderAt: { $max: '$createdAt' },
        },
      },
    ]),
    PackingDispatchRecord.aggregate([
      { $match: { customerId } },
      { $group: { _id: '$productId', dispatched: { $sum: '$packedQuantity' }, lastAt: { $max: '$dispatchDate' } } },
    ]),
    countByProduct(MouldingRecord, customerId, 'goodParts'),
    countByProduct(AssemblyRecord, customerId, 'assembledQuantity'),
    countByProduct(QCRecord, customerId, 'acceptedQuantity'),
    countByProduct(PackingDispatchRecord, customerId, 'packedQuantity'),
  ]);

  const ordersByProduct = new Map(ordersAgg.map((r) => [String(r._id), r]));
  const dispatchByProduct = new Map(dispatchAgg.map((r) => [String(r._id), r]));

  const rows = products.map((p) => {
    const id = String(p._id);
    const o = ordersByProduct.get(id) || { total: 0, active: 0, orderedQty: 0, lastOrderAt: null };
    const d = dispatchByProduct.get(id) || { dispatched: 0, lastAt: null };

    // Overall = furthest started stage's progress (req #9). Denominators mirror the
    // per-stage math on the detailed order dashboard.
    const mGood = mCount.get(id)?.sum || 0;
    const aGood = aCount.get(id)?.sum || 0;
    const qAcc = qCount.get(id)?.sum || 0;
    const progressPct = overallProgress([
      { started: !!mCount.get(id), pct: pct(mGood, o.orderedQty) },
      { started: !!aCount.get(id), pct: pct(aGood, o.orderedQty) },
      { started: !!qCount.get(id), pct: pct(qAcc, aGood || o.orderedQty) },
      { started: !!dCount.get(id), pct: pct(d.dispatched, o.orderedQty) },
    ]);

    // Latest activity across all departments + order creation.
    const candidates = [
      o.lastOrderAt,
      mCount.get(id)?.lastAt,
      aCount.get(id)?.lastAt,
      qCount.get(id)?.lastAt,
      dCount.get(id)?.lastAt,
    ].filter(Boolean);
    const lastUpdatedAt = candidates.length
      ? new Date(Math.max(...candidates.map((t) => new Date(t).getTime())))
      : null;

    // Current stage = furthest department reached, unless fully shipped.
    let status = 'Pending';
    if (o.orderedQty > 0 && d.dispatched >= o.orderedQty) status = 'Completed';
    else if (dCount.get(id)) status = 'Dispatching';
    else if (qCount.get(id)) status = 'In QC';
    else if (aCount.get(id)) status = 'In Assembly';
    else if (mCount.get(id)) status = 'In Moulding';
    else if (o.total > 0) status = 'Order placed';

    return {
      id,
      name: p.name,
      itemCode: p.itemCode || null,
      partName: p.partName || null,
      totalOrders: o.total,
      activeOrders: o.active,
      progressPct,
      status,
      lastUpdatedAt,
    };
  });

  return { customer: customerName, products: rows };
}

// ---------------------------------------------------------------------------
// GET /customer/products/:id/orders — every OrderID for one product
// ---------------------------------------------------------------------------
async function getProductOrders(user, productId) {
  const customerId = customerScope(user);
  const product = await Product.findOne({ _id: productId, customerId }).select('name itemCode partName').lean();
  if (!product) throw notFound('Product not found', 'product_not_found');

  const orders = await Order.aggregate([
    { $match: { customerId, productId: new mongoose.Types.ObjectId(productId) } },
    { $sort: { createdAt: -1 } },
    sumLookup(MouldingRecord, 'goodParts', 'moulding'),
    sumLookup(AssemblyRecord, 'assembledQuantity', 'assembly'),
    sumLookup(QCRecord, 'acceptedQuantity', 'qc'),
    sumLookup(PackingDispatchRecord, 'packedQuantity', 'dispatch'),
    {
      $addFields: {
        mouldingCount: { $ifNull: [{ $arrayElemAt: ['$moulding.count', 0] }, 0] },
        assemblyCount: { $ifNull: [{ $arrayElemAt: ['$assembly.count', 0] }, 0] },
        qcCount: { $ifNull: [{ $arrayElemAt: ['$qc.count', 0] }, 0] },
        dispatchCount: { $ifNull: [{ $arrayElemAt: ['$dispatch.count', 0] }, 0] },
        mouldingGood: { $ifNull: [{ $arrayElemAt: ['$moulding.total', 0] }, 0] },
        assemblyGood: { $ifNull: [{ $arrayElemAt: ['$assembly.total', 0] }, 0] },
        qcAccepted: { $ifNull: [{ $arrayElemAt: ['$qc.total', 0] }, 0] },
        dispatchedQuantity: { $ifNull: [{ $arrayElemAt: ['$dispatch.total', 0] }, 0] },
      },
    },
  ]);

  // Resolve the PO number for each item code job (so the customer sees Company → PO → Item Code).
  const poIds = [...new Set(orders.map((o) => o.purchaseOrderId).filter(Boolean).map(String))];
  const poDocs = poIds.length
    ? await PurchaseOrder.find({ _id: { $in: poIds } }).select('poNumber').lean()
    : [];
  const poNumMap = new Map(poDocs.map((p) => [String(p._id), p.poNumber || null]));

  const data = orders.map((o) => {
    const qty = o.orderQuantity || 0;
    return {
      id: String(o._id),
      orderCode: o.orderCode || formatOrderNumber(o._id),
      poNumber: o.purchaseOrderId ? poNumMap.get(String(o.purchaseOrderId)) || null : null,
      orderQuantity: qty,
      dispatchedQuantity: o.dispatchedQuantity,
      progressPct: overallProgress([
        { started: o.mouldingCount > 0, pct: pct(o.mouldingGood, qty) },
        { started: o.assemblyCount > 0, pct: pct(o.assemblyGood, qty) },
        { started: o.qcCount > 0, pct: pct(o.qcAccepted, o.assemblyGood || qty) },
        { started: o.dispatchCount > 0, pct: pct(o.dispatchedQuantity, qty) },
      ]),
      status: deriveOverallStatus(o),
      stageReached: {
        moulding: o.mouldingCount > 0,
        assembly: o.assemblyCount > 0,
        qc: o.qcCount > 0,
        dispatch: o.dispatchCount > 0,
      },
      createdAt: o.createdAt,
    };
  });

  return {
    product: {
      id: String(product._id),
      name: product.name,
      itemCode: product.itemCode || null,
      partName: product.partName || null,
    },
    orders: data,
  };
}

// ===========================================================================
// PO-FIRST customer portal (Home → Purchase Order → Item Code dashboard)
// ===========================================================================
//
// The customer works exactly the way the factory does: Company → Purchase Order →
// Item Code. These two read-only endpoints roll the per-department production sums up
// to the PO (Home grid) and list a PO's item codes; the leaf is the existing
// getOrderDashboard, so every downstream detail (per-mould / QC / dispatch) is reused.

// The per-order production sums + stage flags used by both PO endpoints. Kept in one
// place so the PO list and the PO detail compute progress identically.
const ORDER_PRODUCTION_FIELDS = {
  mouldingCount: { $ifNull: [{ $arrayElemAt: ['$moulding.count', 0] }, 0] },
  assemblyCount: { $ifNull: [{ $arrayElemAt: ['$assembly.count', 0] }, 0] },
  qcCount: { $ifNull: [{ $arrayElemAt: ['$qc.count', 0] }, 0] },
  dispatchCount: { $ifNull: [{ $arrayElemAt: ['$dispatch.count', 0] }, 0] },
  mouldingGood: { $ifNull: [{ $arrayElemAt: ['$moulding.total', 0] }, 0] },
  assemblyGood: { $ifNull: [{ $arrayElemAt: ['$assembly.total', 0] }, 0] },
  qcAccepted: { $ifNull: [{ $arrayElemAt: ['$qc.total', 0] }, 0] },
  dispatchedQuantity: { $ifNull: [{ $arrayElemAt: ['$dispatch.total', 0] }, 0] },
};

// Overall production progress for one order/PO from its rolled-up production sums.
function progressFromSums(s, denomQty) {
  return overallProgress([
    { started: s.mouldingCount > 0, pct: pct(s.mouldingGood, denomQty) },
    { started: s.assemblyCount > 0, pct: pct(s.assemblyGood, denomQty) },
    { started: s.qcCount > 0, pct: pct(s.qcAccepted, s.assemblyGood || denomQty) },
    { started: s.dispatchCount > 0, pct: pct(s.dispatchedQuantity, denomQty) },
  ]);
}

function stageReachedFrom(s) {
  return {
    moulding: s.mouldingCount > 0,
    assembly: s.assemblyCount > 0,
    qc: s.qcCount > 0,
    dispatch: s.dispatchCount > 0,
  };
}

// ---------------------------------------------------------------------------
// GET /customer/purchase-orders — the Home grid: every PO with a headline summary
// ---------------------------------------------------------------------------
async function getPurchaseOrders(user) {
  const customerId = customerScope(user);
  const [customer, pos] = await Promise.all([
    Customer.findById(customerId).select('name').lean(),
    PurchaseOrder.find({ customerId }).sort({ createdAt: -1 }).lean(),
  ]);
  const customerName = customer ? customer.name : null;
  if (pos.length === 0) return { customer: customerName, purchaseOrders: [] };

  // Roll every item-code order's production up to its PO.
  const agg = await Order.aggregate([
    { $match: { customerId, purchaseOrderId: { $ne: null } } },
    sumLookup(MouldingRecord, 'goodParts', 'moulding'),
    sumLookup(AssemblyRecord, 'assembledQuantity', 'assembly'),
    sumLookup(QCRecord, 'acceptedQuantity', 'qc'),
    sumLookup(PackingDispatchRecord, 'packedQuantity', 'dispatch'),
    {
      $addFields: {
        ...ORDER_PRODUCTION_FIELDS,
        // 1 when this item code's QC is fully signed off (both Moulding + Assembly QC closed).
        qcDone: {
          $cond: [
            {
              $and: [
                { $in: ['moulding', { $ifNull: ['$qcClosedDepartments', []] }] },
                { $in: ['assembly', { $ifNull: ['$qcClosedDepartments', []] }] },
              ],
            },
            1,
            0,
          ],
        },
        lastActivityAt: {
          $max: [
            { $arrayElemAt: ['$moulding.lastAt', 0] },
            { $arrayElemAt: ['$assembly.lastAt', 0] },
            { $arrayElemAt: ['$qc.lastAt', 0] },
            { $arrayElemAt: ['$dispatch.lastAt', 0] },
            '$createdAt',
          ],
        },
      },
    },
    {
      $group: {
        _id: '$purchaseOrderId',
        itemCount: { $sum: 1 },
        orderedQty: { $sum: '$orderQuantity' },
        mouldingGood: { $sum: '$mouldingGood' },
        assemblyGood: { $sum: '$assemblyGood' },
        qcAccepted: { $sum: '$qcAccepted' },
        dispatchedQuantity: { $sum: '$dispatchedQuantity' },
        mouldingCount: { $sum: '$mouldingCount' },
        assemblyCount: { $sum: '$assemblyCount' },
        qcCount: { $sum: '$qcCount' },
        qcDoneCount: { $sum: '$qcDone' },
        dispatchCount: { $sum: '$dispatchCount' },
        lastActivityAt: { $max: '$lastActivityAt' },
      },
    },
  ]);
  const byPo = new Map(agg.map((r) => [String(r._id), r]));

  const purchaseOrders = pos.map((po) => {
    const g = byPo.get(String(po._id)) || {
      itemCount: 0, orderedQty: 0, mouldingGood: 0, assemblyGood: 0, qcAccepted: 0,
      dispatchedQuantity: 0, mouldingCount: 0, assemblyCount: 0, qcCount: 0, qcDoneCount: 0, dispatchCount: 0, lastActivityAt: null,
    };
    const derivedStatus = deriveOverallStatus({
      orderQuantity: g.orderedQty,
      dispatchedQuantity: g.dispatchedQuantity,
      dispatchCount: g.dispatchCount,
      qcCount: g.qcCount,
      qcAccepted: g.qcAccepted,
      // PO QC is complete only when EVERY item code has been signed off.
      qcDone: g.itemCount > 0 && g.qcDoneCount >= g.itemCount,
      assemblyCount: g.assemblyCount,
      assemblyGood: g.assemblyGood,
      mouldingGood: g.mouldingGood,
      mouldingCount: g.mouldingCount,
    });
    return {
      id: String(po._id),
      poNumber: po.poNumber || null,
      status: derivedStatus,
      // Real PO lifecycle (Open/Completed/Archived) so the customer can see AND separate
      // active vs archived POs — `status` above is only the live production stage.
      poStatus: po.status,
      // A PO is "done" (Archived bucket) ONLY when every item code is finished AND fully
      // dispatched — i.e. the whole order is produced and shipped. We deliberately IGNORE the
      // admin's cached po.status here: production auto-archives a PO the moment moulding
      // finishes (long before dispatch), which used to drop still-shipping POs into the
      // customer's Archived tab. Deriving purely from real dispatch (derivedStatus ===
      // 'Completed' ⇒ dispatchedQuantity >= orderedQty) keeps a PO Active until it truly ships.
      archived: derivedStatus === 'Completed',
      itemCount: g.itemCount || 0,
      totalQuantity: g.orderedQty || 0,
      dispatchedQuantity: g.dispatchedQuantity || 0,
      progressPct: progressFromSums(g, g.orderedQty),
      stageReached: stageReachedFrom(g),
      lastUpdatedAt: g.lastActivityAt || po.createdAt,
      createdAt: po.createdAt,
    };
  });

  return { customer: customerName, purchaseOrders };
}

// ---------------------------------------------------------------------------
// GET /customer/purchase-orders/:id — every Item Code inside one PO
// ---------------------------------------------------------------------------
async function getPurchaseOrderDetail(user, poId) {
  const customerId = customerScope(user);
  const po = await PurchaseOrder.findOne({ _id: poId, customerId }).lean();
  if (!po) throw notFound('Purchase order not found', 'purchase_order_not_found');

  const orders = await Order.aggregate([
    { $match: { customerId, purchaseOrderId: new mongoose.Types.ObjectId(poId) } },
    { $sort: { createdAt: 1 } },
    {
      $lookup: { from: Product.collection.name, localField: 'productId', foreignField: '_id', as: 'product' },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    sumLookup(MouldingRecord, 'goodParts', 'moulding'),
    sumLookup(AssemblyRecord, 'assembledQuantity', 'assembly'),
    sumLookup(QCRecord, 'acceptedQuantity', 'qc'),
    sumLookup(PackingDispatchRecord, 'packedQuantity', 'dispatch'),
    {
      $addFields: {
        ...ORDER_PRODUCTION_FIELDS,
        itemCode: '$product.itemCode',
        productName: '$product.name',
        partName: '$product.partName',
      },
    },
  ]);

  const roll = {
    orderedQty: 0, mouldingGood: 0, assemblyGood: 0, qcAccepted: 0, dispatchedQuantity: 0,
    mouldingCount: 0, assemblyCount: 0, qcCount: 0, qcDoneCount: 0, dispatchCount: 0,
  };
  const data = orders.map((o) => {
    const qty = o.orderQuantity || 0;
    roll.orderedQty += qty;
    roll.mouldingGood += o.mouldingGood; roll.assemblyGood += o.assemblyGood;
    roll.qcAccepted += o.qcAccepted; roll.dispatchedQuantity += o.dispatchedQuantity;
    roll.mouldingCount += o.mouldingCount; roll.assemblyCount += o.assemblyCount;
    roll.qcCount += o.qcCount; roll.dispatchCount += o.dispatchCount;
    if (isQcSignedOff(o.qcClosedDepartments)) roll.qcDoneCount += 1;
    return {
      id: String(o._id),
      orderCode: o.orderCode || formatOrderNumber(o._id),
      itemCode: o.itemCode || null,
      productName: o.productName || null,
      partName: o.partName || null,
      orderQuantity: qty,
      dispatchedQuantity: o.dispatchedQuantity,
      progressPct: progressFromSums(o, qty),
      status: deriveOverallStatus(o),
      stageReached: stageReachedFrom(o),
      createdAt: o.createdAt,
    };
  });

  const derivedStatus = deriveOverallStatus({
    orderQuantity: roll.orderedQty,
    dispatchedQuantity: roll.dispatchedQuantity,
    dispatchCount: roll.dispatchCount,
    qcCount: roll.qcCount,
    qcAccepted: roll.qcAccepted,
    // PO QC is complete only when EVERY item code has been signed off.
    qcDone: data.length > 0 && roll.qcDoneCount >= data.length,
    assemblyCount: roll.assemblyCount,
    assemblyGood: roll.assemblyGood,
    mouldingGood: roll.mouldingGood,
    mouldingCount: roll.mouldingCount,
  });
  return {
    purchaseOrder: {
      id: String(po._id),
      poNumber: po.poNumber || null,
      status: derivedStatus,
      poStatus: po.status,
      // Done = the whole PO is produced AND fully dispatched (derivedStatus 'Completed'). We
      // ignore the admin's cached po.status on purpose — production auto-archives a PO when
      // moulding finishes, well before dispatch, so trusting it would archive still-shipping
      // POs. See getPurchaseOrders for the full rationale.
      archived: derivedStatus === 'Completed',
      itemCount: data.length,
      totalQuantity: roll.orderedQty,
      dispatchedQuantity: roll.dispatchedQuantity,
      progressPct: progressFromSums(roll, roll.orderedQty),
      notes: po.notes || null,
      createdAt: po.createdAt,
    },
    orders: data,
  };
}

// ---------------------------------------------------------------------------
// GET /customer/orders/:id/dashboard — the complete manufacturing dashboard
// ---------------------------------------------------------------------------
async function getOrderDashboard(user, orderId) {
  const customerId = customerScope(user);
  const order = await loadOwnedOrder(orderId, customerId);
  const oid = new mongoose.Types.ObjectId(orderId);
  // The Purchase Order this item code job belongs to (Company → PO → Item Code).
  const po = order.purchaseOrderId
    ? await PurchaseOrder.findById(order.purchaseOrderId).select('poNumber').lean()
    : null;

  const [product, customer, orderMolds, mouldAgg, asmAgg, asmLineAgg, qcAgg, dispatchRecs, timelineDates] =
    await Promise.all([
      Product.findById(order.productId).select('name itemCode partName').lean(),
      Customer.findById(order.customerId).select('name').lean(),
      OrderMold.find({ orderId: oid }).lean(),
      // Per-mould production, latest-first so $first captures the latest machine/shift.
      MouldingRecord.aggregate([
        { $match: { orderId: oid } },
        { $sort: { createdAt: -1 } },
        {
          // By setup row (names may repeat on an item code); legacy name-only records are
          // attached to the setup carrying their name below.
          $group: {
            _id: { setupId: '$orderMoldId', moldName: '$moldName' },
            goodParts: { $sum: '$goodParts' },
            producedQuantity: { $sum: '$productionQuantity' },
            shotsDone: { $sum: '$shotsDone' },
            rejectedShots: { $sum: '$rejectedShots' },
            cavity: { $first: '$cavity' },
            machine: { $first: '$machineNumber' },
            shift: { $first: '$shift' },
            lastAt: { $first: '$createdAt' },
          },
        },
      ]),
      AssemblyRecord.aggregate([
        { $match: { orderId: oid } },
        {
          $group: {
            _id: null,
            assembledGood: { $sum: '$assembledQuantity' },
            rejected: { $sum: '$rejectedQuantity' },
            operators: { $sum: '$operatorCount' },
            runs: { $sum: 1 },
            lastAt: { $max: '$createdAt' },
          },
        },
      ]),
      // Per assembly-line breakdown so the customer sees detailed assembly records
      // (mirrors the per-mould breakdown in Moulding). Latest run first so $first
      // captures the most recent shift/operator count for the line.
      AssemblyRecord.aggregate([
        { $match: { orderId: oid } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$assemblyLine',
            goodAssemblies: { $sum: '$assembledQuantity' },
            rejected: { $sum: '$rejectedQuantity' },
            operators: { $first: '$operatorCount' },
            runs: { $sum: 1 },
            shift: { $first: '$shift' },
            lastAt: { $first: '$createdAt' },
          },
        },
      ]),
      QCRecord.aggregate([
        { $match: { orderId: oid } },
        {
          $group: {
            _id: null,
            accepted: { $sum: '$acceptedQuantity' },
            rejected: { $sum: '$rejectedQuantity' },
            inspected: { $sum: '$sampleSize' },
            runs: { $sum: 1 },
            lastAt: { $max: '$createdAt' },
          },
        },
      ]),
      PackingDispatchRecord.find({ orderId: oid, customerId }).sort({ dispatchDate: 1 }).lean(),
      // Earliest activity per stage for the timeline.
      Promise.all([
        OrderMold.findOne({ orderId: oid }).sort({ createdAt: 1 }).select('createdAt').lean(),
        MouldingRecord.findOne({ orderId: oid }).sort({ createdAt: 1 }).select('createdAt').lean(),
        AssemblyRecord.findOne({ orderId: oid }).sort({ createdAt: 1 }).select('createdAt').lean(),
        QCRecord.findOne({ orderId: oid }).sort({ createdAt: 1 }).select('createdAt').lean(),
        PackingDispatchRecord.findOne({ orderId: oid }).sort({ dispatchDate: 1 }).select('dispatchDate').lean(),
      ]),
    ]);

  const orderQty = order.orderQuantity || 0;

  // Image-first defect reports authored by engineers, scoped to this customer's order
  // (req #5). Company → Product → Order → QC Reports linkage is enforced by the query.
  const defectReportDocs = await QCReport.find({ orderId: oid, customerId })
    .populate('photos')
    .sort({ createdAt: -1 })
    .lean();
  const defectReports = defectReportDocs.map(toCustomerDefectReport);

  // ---- Moulding: per mould + overall roll-up -------------------------------
  const knownSetup = new Set(orderMolds.map((m) => String(m._id)));
  const firstSetupByName = new Map();
  for (const m of orderMolds) if (!firstSetupByName.has(m.moldName)) firstSetupByName.set(m.moldName, m);
  const producedByMold = new Map(); // key: setup id, or `name:<moldName>` for orphaned production
  for (const g of mouldAgg) {
    const sid = g._id.setupId ? String(g._id.setupId) : null;
    const key = sid && knownSetup.has(sid)
      ? sid
      : firstSetupByName.has(g._id.moldName)
        ? String(firstSetupByName.get(g._id.moldName)._id)
        : `name:${g._id.moldName}`;
    const cur = producedByMold.get(key);
    if (!cur) {
      producedByMold.set(key, { ...g, moldName: g._id.moldName });
    } else {
      cur.goodParts += g.goodParts || 0;
      cur.producedQuantity += g.producedQuantity || 0;
      cur.shotsDone += g.shotsDone || 0;
      cur.rejectedShots += g.rejectedShots || 0;
      if (g.lastAt && (!cur.lastAt || g.lastAt > cur.lastAt)) {
        cur.lastAt = g.lastAt; cur.machine = g.machine; cur.shift = g.shift;
      }
    }
  }
  const keys = [...orderMolds.map((m) => String(m._id)), ...[...producedByMold.keys()].filter((k) => k.startsWith('name:'))];
  const molds = keys.map((key) => {
    const def = orderMolds.find((m) => String(m._id) === key);
    const prod = producedByMold.get(key) || {};
    const name = def ? def.moldName : prod.moldName;
    const cavity = (def && def.cavity) || prod.cavity || 1;
    const required = def ? (def.requiredShots || 0) * (def.cavity || 1) : 0;
    const good = prod.goodParts || 0;
    const produced = prod.producedQuantity || 0;
    const rejected = Math.max(0, produced - good);
    return {
      moldName: name,
      partName: (def && def.partName) || null,
      machine: prod.machine || null,
      lastShift: prod.shift || null,
      cavity,
      required,
      produced,
      goodParts: good,
      pending: Math.max(0, required - good),
      surplus: Math.max(0, good - required),
      rejectedParts: rejected,
      rejectionRate: ratePct(rejected, produced),
      progressPct: pct(good, required),
      lastUpdatedAt: prod.lastAt || null,
    };
  }).sort((a, b) => a.moldName.localeCompare(b.moldName));

  const mTotals = molds.reduce(
    (a, m) => {
      a.required += m.required; a.produced += m.produced; a.good += m.goodParts;
      a.rejected += m.rejectedParts; a.surplus += m.surplus; return a;
    },
    { required: 0, produced: 0, good: 0, rejected: 0, surplus: 0 }
  );
  const mLastAt = molds.reduce((max, m) => {
    const t = m.lastUpdatedAt ? new Date(m.lastUpdatedAt).getTime() : 0;
    return t > max ? t : max;
  }, 0);
  const moulding = {
    progressPct: pct(mTotals.good, mTotals.required),
    requiredQuantity: mTotals.required,
    producedQuantity: mTotals.produced,
    remainingQuantity: Math.max(0, mTotals.required - mTotals.good),
    surplus: mTotals.surplus,
    goodParts: mTotals.good,
    rejectedParts: mTotals.rejected,
    rejectionRate: ratePct(mTotals.rejected, mTotals.produced),
    lastUpdatedAt: mLastAt ? new Date(mLastAt) : null,
    status: stageStatus(molds.some((m) => m.produced > 0), pct(mTotals.good, mTotals.required)),
    molds,
  };

  // ---- Assembly ------------------------------------------------------------
  const a = asmAgg[0] || { assembledGood: 0, rejected: 0, operators: 0, runs: 0, lastAt: null };
  // Per-line records (detailed, like Moulding's per-mould cards).
  const assemblyLines = (asmLineAgg || [])
    .filter((l) => l._id)
    .map((l) => ({
      lineName: l._id,
      goodAssemblies: l.goodAssemblies || 0,
      rejected: l.rejected || 0,
      rejectionRate: ratePct(l.rejected || 0, (l.goodAssemblies || 0) + (l.rejected || 0)),
      operators: l.operators || 0,
      shift: l.shift || null,
      runs: l.runs || 0,
      lastUpdatedAt: l.lastAt || null,
    }))
    .sort((x, y) => x.lineName.localeCompare(y.lineName));
  const assembly = {
    progressPct: pct(a.assembledGood, orderQty),
    requiredQuantity: orderQty,
    goodAssemblies: a.assembledGood,
    pending: Math.max(0, orderQty - a.assembledGood),
    rejected: a.rejected,
    rejectionRate: ratePct(a.rejected, a.assembledGood + a.rejected),
    operators: a.operators || 0,
    status: stageStatus(a.runs > 0, pct(a.assembledGood, orderQty)),
    lastUpdatedAt: a.lastAt || null,
    lines: assemblyLines,
  };

  // ---- Quality control -----------------------------------------------------
  // The customer's QC progress tracks the NEW centralized QC module (defect reporting),
  // NOT the legacy finished-goods QCRecord. It advances only when the QC Engineer signs
  // off "Done QC for this PO" per department: Moulding QC done ⇒ 50%, Assembly QC done ⇒
  // the other 50% (100% total). `defectReports` (below) are all the image-first reports
  // filed against this item code, shown inside the QC tab.
  const q = qcAgg[0] || { accepted: 0, rejected: 0, inspected: 0, runs: 0, lastAt: null };
  const closedDepts = order.qcClosedDepartments || [];
  const mouldingQcDone = closedDepts.includes('moulding');
  const assemblyQcDone = closedDepts.includes('assembly');
  const qcProgressPct = (mouldingQcDone ? 50 : 0) + (assemblyQcDone ? 50 : 0);
  const openReports = defectReports.filter(
    (r) => r.status === 'open' || r.status === 'investigating'
  ).length;
  const qc = {
    progressPct: qcProgressPct,
    mouldingQcDone,
    assemblyQcDone,
    reportCount: defectReports.length,
    openReports,
    status:
      qcProgressPct >= 100
        ? 'Completed'
        : qcProgressPct > 0 || defectReports.length > 0
        ? 'In progress'
        : 'Not started',
    lastUpdatedAt: defectReports[0] ? defectReports[0].createdAt : q.lastAt || null,
  };

  // ---- Dispatch ------------------------------------------------------------
  const shipments = dispatchRecs.map((r) => ({
    dispatchDate: r.dispatchDate,
    quantity: r.packedQuantity,
    cartonCount: r.cartonCount,
    transporter: r.transporterName || null,
    vehicleNumber: r.vehicleNumber || null,
    lrNumber: r.lrNumber || null,
    invoiceNumber: r.invoiceNumber || null,
  }));
  const dispatched = shipments.reduce((s, x) => s + x.quantity, 0);
  const cartons = shipments.reduce((s, x) => s + x.cartonCount, 0);
  const dispatch = {
    progressPct: pct(dispatched, orderQty),
    dispatchedQuantity: dispatched,
    remainingQuantity: Math.max(0, orderQty - dispatched),
    cartonCount: cartons,
    shipmentCount: shipments.length,
    lastDispatchDate: shipments.length ? shipments[shipments.length - 1].dispatchDate : null,
    status:
      orderQty > 0 && dispatched >= orderQty ? 'Completed' : stageStatus(shipments.length > 0, pct(dispatched, orderQty)),
    shipments,
  };

  // Overall production progress = furthest started stage (req #9) — the single shared
  // source of truth also used by the product/order cards.
  const overallProgressPct = overallProgress([
    { started: molds.some((m) => m.produced > 0), pct: moulding.progressPct },
    { started: a.runs > 0, pct: assembly.progressPct },
    { started: q.runs > 0, pct: qc.progressPct },
    { started: shipments.length > 0, pct: dispatch.progressPct },
  ]);

  // ---- Timeline (derived earliest dates) -----------------------------------
  const [moldSetupAt, prodAt, asmStartAt, qcStartAt, packAt] = timelineDates;
  const step = (label, at, done) => ({ label, at: at || null, done: !!done });
  const timeline = [
    step('Order Created', order.createdAt, true),
    step('Mould Setup Complete', moldSetupAt?.createdAt, !!moldSetupAt),
    step('Production Started', prodAt?.createdAt, !!prodAt),
    step('Assembly Started', asmStartAt?.createdAt, !!asmStartAt),
    step('QC Started', qcStartAt?.createdAt, !!qcStartAt),
    step('Packing Started', packAt?.dispatchDate, !!packAt),
    step('Dispatched', dispatch.lastDispatchDate, dispatch.status === 'Completed'),
  ];

  return {
    order: {
      id: String(order._id),
      orderCode: order.orderCode || formatOrderNumber(order._id),
      poNumber: po ? po.poNumber || null : null,
      product: product ? product.name : null,
      itemCode: product ? product.itemCode || null : null,
      partName: product ? product.partName || null : null,
      customer: customer ? customer.name : null,
      orderQuantity: orderQty,
      overallProgressPct,
      status: dispatch.status === 'Completed' ? 'Completed' : deriveOverallStatus({
        orderQuantity: orderQty,
        dispatchedQuantity: dispatched,
        dispatchCount: shipments.length,
        qcCount: q.runs,
        qcAccepted: q.accepted,
        // QC is signed off when both departments are closed (qcProgressPct hits 100).
        qcDone: qcProgressPct >= 100,
        assemblyCount: a.runs,
        assemblyGood: a.assembledGood,
        mouldingGood: mTotals.good,
        mouldingCount: molds.filter((m) => m.produced > 0).length,
      }),
      createdAt: order.createdAt,
    },
    moulding,
    assembly,
    qc,
    dispatch,
    defectReports,
    timeline,
  };
}

// ---------------------------------------------------------------------------
// POST /customer/orders/:id/qc-reports/:reportId/comments — customer reply
// ---------------------------------------------------------------------------
//
// The single deliberate write in this otherwise read-only service. Scoped hard to the
// caller's own customerId AND orderId, so a customer can only ever comment on a QC case
// that belongs to one of their own orders. Customers cannot change status, upload images
// or close cases — only append a comment to the shared thread.
async function addQcComment(user, orderId, reportId, text) {
  const customerId = customerScope(user);
  const order = await loadOwnedOrder(orderId, customerId); // 404 unless owned by caller

  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    throw notFound('QC report not found', 'qc_report_not_found');
  }
  const clean = String(text || '').trim();
  if (!clean) throw badRequest('Comment text is required', 'invalid_comment');

  const report = await QCReport.findOne({ _id: reportId, orderId: order._id, customerId });
  if (!report) throw notFound('QC report not found', 'qc_report_not_found');

  const customer = await Customer.findById(customerId).select('name').lean();
  report.comments.push({
    authorId: user.id,
    authorName: customer ? customer.name : 'Customer',
    authorRole: 'customer',
    text: clean,
  });
  await report.save();
  await report.populate('photos');
  return { report: toCustomerDefectReport(report) };
}

module.exports = {
  getDashboard,
  listOrders,
  getOrderDetails,
  getOrderProgress,
  getComponentAvailability,
  getFinishedGoods,
  getProducts,
  getProductOrders,
  getPurchaseOrders,
  getPurchaseOrderDetail,
  getOrderDashboard,
  addQcComment,
};
