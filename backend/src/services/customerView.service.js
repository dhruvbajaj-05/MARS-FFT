'use strict';

const mongoose = require('mongoose');
const Order = require('../models/Order');
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

const { notFound, forbidden } = require('../utils/httpError');
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
        { $group: { _id: null, total: { $sum: `$${field}` }, count: { $sum: 1 } } },
      ],
      as,
    },
  };
}

// Customer-facing overall stage, derived from how far production has progressed.
function deriveOverallStatus(o) {
  const qty = o.orderQuantity || 0;
  if (qty > 0 && o.dispatchedQuantity >= qty) return 'Completed';
  if (o.dispatchCount > 0) return 'Dispatching';
  if (o.qcCount > 0) return 'In QC';
  if (o.assemblyCount > 0) return 'In Assembly';
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
          qcCount: { $ifNull: [{ $arrayElemAt: ['$qc.count', 0] }, 0] },
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
          qcCount: 1,
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
    Product.findById(order.productId).select('name partName').lean(),
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
  const product = await Product.findOne({ _id: productId, customerId }).select('name partName').lean();
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

  const data = orders.map((o) => {
    const qty = o.orderQuantity || 0;
    return {
      id: String(o._id),
      orderCode: o.orderCode || formatOrderNumber(o._id),
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
    product: { id: String(product._id), name: product.name, partName: product.partName || null },
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

  const [product, customer, orderMolds, mouldAgg, asmAgg, qcAgg, dispatchRecs, qcPhotoDocs, timelineDates] =
    await Promise.all([
      Product.findById(order.productId).select('name partName').lean(),
      Customer.findById(order.customerId).select('name').lean(),
      OrderMold.find({ orderId: oid }).lean(),
      // Per-mould production, latest-first so $first captures the latest machine/shift.
      MouldingRecord.aggregate([
        { $match: { orderId: oid } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$moldName',
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
      QCRecord.find({ orderId: oid, customerId }).populate('photos').lean(),
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
  const producedByMold = new Map(mouldAgg.map((m) => [m._id, m]));
  const moldNames = new Set([...orderMolds.map((m) => m.moldName), ...mouldAgg.map((m) => m._id)]);
  const molds = [...moldNames].map((name) => {
    const def = orderMolds.find((m) => m.moldName === name);
    const prod = producedByMold.get(name) || {};
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
  };

  // ---- Quality control -----------------------------------------------------
  const q = qcAgg[0] || { accepted: 0, rejected: 0, inspected: 0, runs: 0, lastAt: null };
  const defectMap = new Map();
  const qcPhotos = [];
  for (const rec of qcPhotoDocs) {
    for (const def of rec.defects || []) {
      defectMap.set(def.defectType, (defectMap.get(def.defectType) || 0) + def.quantity);
    }
    for (const ph of rec.photos || []) {
      const m = toMedia(ph);
      if (m) qcPhotos.push(m);
    }
  }
  const qc = {
    progressPct: pct(q.inspected, a.assembledGood || orderQty),
    passed: q.accepted,
    failed: q.rejected,
    inspected: q.inspected,
    pendingInspection: Math.max(0, (a.assembledGood || 0) - q.inspected),
    passRate: ratePct(q.accepted, q.accepted + q.rejected),
    defects: [...defectMap.entries()].map(([type, quantity]) => ({ type, quantity })).sort((x, y) => y.quantity - x.quantity),
    photos: qcPhotos,
    status: stageStatus(q.runs > 0, pct(q.inspected, a.assembledGood || orderQty)),
    lastUpdatedAt: q.lastAt || null,
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
      product: product ? product.name : null,
      partName: product ? product.partName || null : null,
      customer: customer ? customer.name : null,
      orderQuantity: orderQty,
      overallProgressPct,
      status: dispatch.status === 'Completed' ? 'Completed' : deriveOverallStatus({
        orderQuantity: orderQty,
        dispatchedQuantity: dispatched,
        dispatchCount: shipments.length,
        qcCount: q.runs,
        assemblyCount: a.runs,
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

module.exports = {
  getDashboard,
  listOrders,
  getOrderDetails,
  getOrderProgress,
  getComponentAvailability,
  getFinishedGoods,
  getProducts,
  getProductOrders,
  getOrderDashboard,
};
