'use strict';

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const MouldingRecord = require('../models/MouldingRecord');
const AssemblyRecord = require('../models/AssemblyRecord');
const QCRecord = require('../models/QCRecord');
const PackingDispatchRecord = require('../models/PackingDispatchRecord');

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

module.exports = {
  getDashboard,
  listOrders,
  getOrderDetails,
  getOrderProgress,
  getComponentAvailability,
  getFinishedGoods,
};
