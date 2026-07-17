'use strict';

const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const MouldingRecord = require('../models/MouldingRecord');
const AssemblyRecord = require('../models/AssemblyRecord');
const QCRecord = require('../models/QCRecord');
const PackingDispatchRecord = require('../models/PackingDispatchRecord');
const ComponentStockItem = require('../models/ComponentStockItem');
const FinishedGoodsItem = require('../models/FinishedGoodsItem');

const { badRequest } = require('../utils/httpError');
const { parsePagination, buildList } = require('../utils/pagination');
const { delayedCutoff, ageInDays, DELAYED_AFTER_DAYS } = require('../utils/sla');

// Phase 9 — Admin dashboard (Module 6). READ-ONLY analytics across the whole system.
// Every figure is produced by a MongoDB aggregation pipeline where possible; this
// service never writes. All routes are admin-only (enforced in admin.routes.js).

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// A $lookup sub-pipeline that sums one numeric field per order, plus a record count.
// Used to fold per-department production onto each order document.
function orderSumLookup(model, field, as) {
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

const pick = (path, fallback = 0) => ({ $ifNull: [{ $arrayElemAt: [path, 0] }, fallback] });

// Sum a single numeric field across an entire collection (one $group, no $match).
async function sumField(model, field) {
  const [agg] = await model.aggregate([
    { $group: { _id: null, total: { $sum: `$${field}` }, count: { $sum: 1 } } },
  ]);
  return agg || { total: 0, count: 0 };
}

// Customer-facing overall stage for an order, from how far production has progressed.
function deriveOverallStatus(o) {
  const qty = o.orderQuantity || 0;
  if (qty > 0 && o.dispatchedQuantity >= qty) return 'Completed';
  if (o.dispatchCount > 0) return 'Dispatching';
  if (o.qcCount > 0) return 'In QC';
  if (o.assemblyCount > 0) return 'In Assembly';
  if (o.mouldingCount > 0) return 'In Moulding';
  return 'Pending';
}

const formatOrderNumber = (id) => `ORD-${id.toString().slice(-6).toUpperCase()}`;

// ---------------------------------------------------------------------------
// GET /admin/dashboard — top-level counters
// ---------------------------------------------------------------------------
//
// Total Customers / Products / Orders + Active / Completed orders. Completion is
// fulfillment-based (dispatched quantity >= ordered quantity), matching Phase 8.
async function getDashboard() {
  const [customers, products, totalOrders, orderAgg] = await Promise.all([
    Customer.estimatedDocumentCount(),
    Product.estimatedDocumentCount(),
    Order.estimatedDocumentCount(),
    Order.aggregate([
      {
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
          dispatchedQuantity: pick('$dispatch.dispatched'),
          isCompleted: {
            $and: [
              { $gt: ['$orderQuantity', 0] },
              { $gte: [pick('$dispatch.dispatched'), '$orderQuantity'] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: ['$isCompleted', 1, 0] } },
        },
      },
    ]),
  ]);

  const orders = orderAgg[0] || { total: 0, completed: 0 };

  return {
    totalCustomers: customers,
    totalProducts: products,
    totalOrders,
    activeOrders: orders.total - orders.completed,
    completedOrders: orders.completed,
  };
}

// ---------------------------------------------------------------------------
// GET /admin/production-summary — headline production quantities per department
// ---------------------------------------------------------------------------
async function getProductionSummary() {
  const [moulding, assembly, qc, dispatch] = await Promise.all([
    sumField(MouldingRecord, 'productionQuantity'),
    sumField(AssemblyRecord, 'assembledQuantity'),
    sumField(QCRecord, 'acceptedQuantity'),
    sumField(PackingDispatchRecord, 'packedQuantity'),
  ]);

  return {
    totalMouldingProduction: moulding.total,
    totalAssemblyProduction: assembly.total,
    totalQcAccepted: qc.total,
    totalDispatchQuantity: dispatch.total,
  };
}

// ---------------------------------------------------------------------------
// GET /admin/rejections — rejection analytics across departments
// ---------------------------------------------------------------------------
//
// QC rejections also carry a defect-type breakdown (defects are only modelled in QC).
async function getRejections() {
  const [moulding, assembly, qc, qcDefects] = await Promise.all([
    MouldingRecord.aggregate([
      { $group: { _id: null, total: { $sum: { $subtract: ['$productionQuantity', '$goodParts'] } }, count: { $sum: 1 } } },
    ]).then(([r]) => r || { total: 0, count: 0 }),
    sumField(AssemblyRecord, 'rejectedQuantity'),
    sumField(QCRecord, 'rejectedQuantity'),
    QCRecord.aggregate([
      { $unwind: '$defects' },
      { $group: { _id: '$defects.defectType', quantity: { $sum: '$defects.quantity' } } },
      { $project: { _id: 0, defectType: '$_id', quantity: 1 } },
      { $sort: { quantity: -1 } },
    ]),
  ]);

  return {
    mouldingRejections: moulding.total,
    assemblyRejections: assembly.total,
    qcRejections: qc.total,
    totalRejections: moulding.total + assembly.total + qc.total,
    qcDefectBreakdown: qcDefects, // [{ defectType, quantity }]
  };
}

// ---------------------------------------------------------------------------
// GET /admin/departments — per-department totals, rejections and throughput
// ---------------------------------------------------------------------------
//
// "Throughput" = the good/usable output each department passes downstream:
//   Moulding  goodParts   Assembly  assembledQuantity
//   QC        acceptedQuantity   Dispatch  packedQuantity (shipped)
async function getDepartments() {
  const [moulding, assembly, qc, dispatch] = await Promise.all([
    MouldingRecord.aggregate([
      {
        $group: {
          _id: null,
          recordCount: { $sum: 1 },
          total: { $sum: '$productionQuantity' },
          throughput: { $sum: '$goodParts' },
          rejections: { $sum: { $subtract: ['$productionQuantity', '$goodParts'] } },
        },
      },
    ]),
    AssemblyRecord.aggregate([
      {
        $group: {
          _id: null,
          recordCount: { $sum: 1 },
          total: { $sum: '$inputQuantity' },
          throughput: { $sum: '$assembledQuantity' },
          rejections: { $sum: '$rejectedQuantity' },
        },
      },
    ]),
    QCRecord.aggregate([
      {
        $group: {
          _id: null,
          recordCount: { $sum: 1 },
          total: { $sum: '$sampleSize' },
          throughput: { $sum: '$acceptedQuantity' },
          rejections: { $sum: '$rejectedQuantity' },
        },
      },
    ]),
    PackingDispatchRecord.aggregate([
      {
        $group: {
          _id: null,
          recordCount: { $sum: 1 },
          total: { $sum: '$packedQuantity' },
          throughput: { $sum: '$packedQuantity' },
          rejections: { $sum: 0 }, // dispatch has no rejection concept
        },
      },
    ]),
  ]);

  const shape = (name, agg, opts = {}) => {
    const a = agg[0] || { recordCount: 0, total: 0, throughput: 0, rejections: 0 };
    // Rejection % is measured against everything classified (throughput + rejections).
    const classified = a.throughput + a.rejections;
    const rejectionPct = classified > 0 ? Math.round((a.rejections / classified) * 100) : 0;
    return {
      department: name,
      recordCount: a.recordCount,
      total: a.total,
      throughput: a.throughput,
      rejections: a.rejections,
      rejectionPct,
      hasRejections: opts.hasRejections !== false,
    };
  };

  return {
    departments: [
      shape('moulding', moulding),
      shape('assembly', assembly),
      shape('qc', qc),
      shape('dispatch', dispatch, { hasRejections: false }),
    ],
  };
}

// ---------------------------------------------------------------------------
// GET /admin/orders — every order, cross-customer, with a status summary
// ---------------------------------------------------------------------------
//
// Optional filters: customerId, productId. Paginated. One aggregation joins the
// customer + product names and per-department production sums.
function buildOrderFilter(query, mongoose) {
  const filter = {};
  for (const key of ['customerId', 'productId']) {
    if (query[key]) {
      if (!mongoose.Types.ObjectId.isValid(query[key])) {
        throw badRequest(`Invalid ${key}`, 'invalid_id');
      }
      filter[key] = new mongoose.Types.ObjectId(query[key]);
    }
  }
  // Filter by a specific order id (the order's _id).
  if (query.orderId) {
    if (!mongoose.Types.ObjectId.isValid(query.orderId)) {
      throw badRequest('Invalid orderId', 'invalid_id');
    }
    filter._id = new mongoose.Types.ObjectId(query.orderId);
  }
  // Search by OrderID code (FFT-#####), case-insensitive prefix.
  if (query.orderCode) {
    const escaped = String(query.orderCode).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.orderCode = { $regex: escaped, $options: 'i' };
  }
  // Filter by overall lifecycle (Active | Completed | Archived).
  if (query.status) filter.status = query.status;
  return filter;
}

// Pipeline stages that fold names + production sums onto each order, shared by the
// orders list and the delayed-orders report.
function orderEnrichmentStages() {
  return [
    {
      $lookup: {
        from: Customer.collection.name,
        localField: 'customerId',
        foreignField: '_id',
        as: 'customer',
      },
    },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: Product.collection.name,
        localField: 'productId',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    orderSumLookup(MouldingRecord, 'goodParts', 'moulding'),
    orderSumLookup(AssemblyRecord, 'assembledQuantity', 'assembly'),
    orderSumLookup(QCRecord, 'acceptedQuantity', 'qc'),
    orderSumLookup(PackingDispatchRecord, 'packedQuantity', 'dispatch'),
    {
      $addFields: {
        mouldingCount: pick('$moulding.count'),
        assemblyCount: pick('$assembly.count'),
        qcCount: pick('$qc.count'),
        dispatchCount: pick('$dispatch.count'),
        dispatchedQuantity: pick('$dispatch.total'),
        customerName: '$customer.name',
        productName: '$product.name',
        itemCode: '$product.itemCode',
      },
    },
  ];
}

function shapeOrderRow(o) {
  const qty = o.orderQuantity || 0;
  return {
    id: o._id.toString(),
    orderCode: o.orderCode || null,
    orderNumber: o.orderCode || formatOrderNumber(o._id),
    customer: o.customerName || null,
    customerId: o.customerId ? o.customerId.toString() : null,
    product: o.productName || null,
    itemCode: o.itemCode || null,
    productId: o.productId ? o.productId.toString() : null,
    orderQuantity: o.orderQuantity,
    dispatchedQuantity: o.dispatchedQuantity,
    progressPct: qty > 0 ? Math.min(100, Math.round((o.dispatchedQuantity / qty) * 100)) : 0,
    status: deriveOverallStatus(o),
    lifecycleStatus: o.status || 'Active',
    productionStatus: o.productionStatus || 'Active',
    assemblyStatus: o.assemblyStatus || 'Active',
    mouldingCount: o.mouldingCount || 0,
    assemblyCount: o.assemblyCount || 0,
    qcCount: o.qcCount || 0,
    dispatchCount: o.dispatchCount || 0,
    createdAt: o.createdAt,
  };
}

async function listOrders(query = {}) {
  const mongoose = require('mongoose');
  const { page, limit, skip } = parsePagination(query);
  const filter = buildOrderFilter(query, mongoose);

  const [items, total] = await Promise.all([
    Order.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      ...orderEnrichmentStages(),
      {
        $project: {
          orderCode: 1,
          status: 1,
          productionStatus: 1,
          assemblyStatus: 1,
          orderQuantity: 1,
          createdAt: 1,
          customerId: 1,
          productId: 1,
          customerName: 1,
          productName: 1,
          itemCode: 1,
          mouldingCount: 1,
          assemblyCount: 1,
          qcCount: 1,
          dispatchCount: 1,
          dispatchedQuantity: 1,
        },
      },
    ]),
    Order.countDocuments(filter),
  ]);

  return buildList(items.map(shapeOrderRow), total, page, limit);
}

// ---------------------------------------------------------------------------
// GET /admin/orders/delayed — active orders past the SLA age threshold
// ---------------------------------------------------------------------------
async function listDelayedOrders(query = {}) {
  const mongoose = require('mongoose');
  const { page, limit, skip } = parsePagination(query);
  const baseFilter = buildOrderFilter(query, mongoose);

  const nowMs = Date.now();
  const cutoff = delayedCutoff(nowMs);

  // Delayed = open (not fully dispatched) AND created before the cutoff. Computed in
  // the pipeline so pagination/count operate on the already-filtered set.
  const pipeline = [
    { $match: { ...baseFilter, createdAt: { $lt: cutoff } } },
    {
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
    { $addFields: { dispatchedQuantity: pick('$dispatch.dispatched') } },
    {
      // Open = NOT fully dispatched.
      $match: {
        $expr: {
          $not: {
            $and: [
              { $gt: ['$orderQuantity', 0] },
              { $gte: ['$dispatchedQuantity', '$orderQuantity'] },
            ],
          },
        },
      },
    },
  ];

  const [items, countAgg] = await Promise.all([
    Order.aggregate([
      ...pipeline,
      { $sort: { createdAt: 1 } }, // oldest (most delayed) first
      { $skip: skip },
      { $limit: limit },
      ...orderEnrichmentStages(),
      {
        $project: {
          orderCode: 1,
          status: 1,
          productionStatus: 1,
          assemblyStatus: 1,
          orderQuantity: 1,
          createdAt: 1,
          customerId: 1,
          productId: 1,
          customerName: 1,
          productName: 1,
          itemCode: 1,
          mouldingCount: 1,
          assemblyCount: 1,
          qcCount: 1,
          dispatchCount: 1,
          dispatchedQuantity: 1,
        },
      },
    ]),
    Order.aggregate([...pipeline, { $count: 'total' }]),
  ]);

  const total = countAgg[0] ? countAgg[0].total : 0;
  const data = items.map((o) => ({
    ...shapeOrderRow(o),
    ageDays: ageInDays(o.createdAt, nowMs),
  }));

  return {
    ...buildList(data, total, page, limit),
    policy: { type: 'sla_age', thresholdDays: DELAYED_AFTER_DAYS },
  };
}

// ---------------------------------------------------------------------------
// GET /admin/customers — per-customer order analytics + performance summary
// ---------------------------------------------------------------------------
async function getCustomerAnalytics(query = {}) {
  const { page, limit, skip } = parsePagination(query);

  // Group orders by customer, deciding completion per order via dispatched quantity,
  // then join the customer name. Customers with zero orders are included via the
  // reverse lookup so the analytics cover every customer.
  const pipeline = [
    {
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
        dispatchedQuantity: pick('$dispatch.dispatched'),
        isCompleted: {
          $and: [
            { $gt: ['$orderQuantity', 0] },
            { $gte: [pick('$dispatch.dispatched'), '$orderQuantity'] },
          ],
        },
      },
    },
    {
      $group: {
        _id: '$customerId',
        totalOrders: { $sum: 1 },
        completedOrders: { $sum: { $cond: ['$isCompleted', 1, 0] } },
        totalOrderedQty: { $sum: '$orderQuantity' },
        totalDispatchedQty: { $sum: '$dispatchedQuantity' },
      },
    },
  ];

  // Drive the list from Customer so customers with no orders still appear, then
  // attach the aggregated order stats.
  const facet = await Customer.aggregate([
    {
      $lookup: {
        from: Order.collection.name,
        let: { cid: '$_id' },
        pipeline: [{ $match: { $expr: { $eq: ['$customerId', '$$cid'] } } }, ...pipeline],
        as: 'stats',
      },
    },
    { $unwind: { path: '$stats', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        totalOrders: { $ifNull: ['$stats.totalOrders', 0] },
        completedOrders: { $ifNull: ['$stats.completedOrders', 0] },
        totalOrderedQty: { $ifNull: ['$stats.totalOrderedQty', 0] },
        totalDispatchedQty: { $ifNull: ['$stats.totalDispatchedQty', 0] },
      },
    },
    {
      $facet: {
        data: [
          { $sort: { totalOrders: -1, name: 1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              name: 1,
              totalOrders: 1,
              completedOrders: 1,
              totalOrderedQty: 1,
              totalDispatchedQty: 1,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]);

  const result = facet[0] || { data: [], totalCount: [] };
  const total = result.totalCount[0] ? result.totalCount[0].count : 0;

  const data = result.data.map((c) => {
    const activeOrders = c.totalOrders - c.completedOrders;
    const completionRate =
      c.totalOrders > 0 ? Math.round((c.completedOrders / c.totalOrders) * 100) : 0;
    const fulfillmentRate =
      c.totalOrderedQty > 0
        ? Math.min(100, Math.round((c.totalDispatchedQty / c.totalOrderedQty) * 100))
        : 0;
    return {
      customerId: c._id.toString(),
      customer: c.name,
      totalOrders: c.totalOrders,
      activeOrders,
      completedOrders: c.completedOrders,
      performance: {
        completionRatePct: completionRate, // completed / total orders
        fulfillmentRatePct: fulfillmentRate, // dispatched / ordered quantity
        totalOrderedQty: c.totalOrderedQty,
        totalDispatchedQty: c.totalDispatchedQty,
      },
    };
  });

  return buildList(data, total, page, limit);
}

// ---------------------------------------------------------------------------
// GET /admin/users — users grouped by role
// ---------------------------------------------------------------------------
async function getUserAnalytics() {
  const [byRole, totalAgg] = await Promise.all([
    User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          activeCount: { $sum: { $cond: ['$isActive', 1, 0] } },
        },
      },
      { $project: { _id: 0, role: '$_id', count: 1, activeCount: 1 } },
      { $sort: { count: -1 } },
    ]),
    User.estimatedDocumentCount(),
  ]);

  return {
    totalUsers: totalAgg,
    byRole, // [{ role, count, activeCount }]
  };
}

// ---------------------------------------------------------------------------
// GET /admin/production/by-customer | by-product | by-mold (Phase 7)
// ---------------------------------------------------------------------------
//
// All three roll up moulding production. `produced` = total moulded,
// `good` = usable output (stocked into the Component Store), `rejected` = scrap.

async function getProductionByCustomer() {
  const rows = await MouldingRecord.aggregate([
    {
      $group: {
        _id: '$customerId',
        produced: { $sum: '$productionQuantity' },
        good: { $sum: '$goodParts' },
        rejected: { $sum: { $subtract: ['$productionQuantity', '$goodParts'] } },
        records: { $sum: 1 },
      },
    },
    { $lookup: { from: Customer.collection.name, localField: '_id', foreignField: '_id', as: 'customer' } },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    { $sort: { produced: -1 } },
  ]);
  return {
    byCustomer: rows.map((r) => ({
      customerId: r._id ? r._id.toString() : null,
      customer: r.customer ? r.customer.name : null,
      produced: r.produced,
      good: r.good,
      rejected: r.rejected,
      records: r.records,
    })),
  };
}

async function getProductionByProduct() {
  const rows = await MouldingRecord.aggregate([
    {
      $group: {
        _id: { productId: '$productId', customerId: '$customerId' },
        produced: { $sum: '$productionQuantity' },
        good: { $sum: '$goodParts' },
        rejected: { $sum: { $subtract: ['$productionQuantity', '$goodParts'] } },
        records: { $sum: 1 },
      },
    },
    { $lookup: { from: Product.collection.name, localField: '_id.productId', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: Customer.collection.name, localField: '_id.customerId', foreignField: '_id', as: 'customer' } },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    { $sort: { produced: -1 } },
  ]);
  return {
    byProduct: rows.map((r) => ({
      productId: r._id.productId ? r._id.productId.toString() : null,
      product: r.product ? r.product.name : null,
      customerId: r._id.customerId ? r._id.customerId.toString() : null,
      customer: r.customer ? r.customer.name : null,
      produced: r.produced,
      good: r.good,
      rejected: r.rejected,
      records: r.records,
    })),
  };
}

async function getProductionByMold() {
  const rows = await MouldingRecord.aggregate([
    {
      $group: {
        _id: { moldName: '$moldName', partName: '$partName', productId: '$productId' },
        produced: { $sum: '$productionQuantity' },
        good: { $sum: '$goodParts' },
        rejected: { $sum: { $subtract: ['$productionQuantity', '$goodParts'] } },
        records: { $sum: 1 },
      },
    },
    { $lookup: { from: Product.collection.name, localField: '_id.productId', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    { $sort: { produced: -1 } },
  ]);
  return {
    byMold: rows.map((r) => ({
      moldName: r._id.moldName,
      partName: r._id.partName,
      productId: r._id.productId ? r._id.productId.toString() : null,
      product: r.product ? r.product.name : null,
      produced: r.produced,
      good: r.good,
      rejected: r.rejected,
      records: r.records,
    })),
  };
}

// ---------------------------------------------------------------------------
// GET /admin/inventory/components | aging | low-stock (Phase 7)
// ---------------------------------------------------------------------------

// Available components: overall totals + per-customer breakdown from the balance table.
async function getInventorySummary() {
  const [overall, byCustomer] = await Promise.all([
    ComponentStockItem.aggregate([
      { $group: { _id: null, totalQuantity: { $sum: '$quantityOnHand' }, cells: { $sum: 1 } } },
    ]),
    ComponentStockItem.aggregate([
      { $group: { _id: '$customerId', totalQuantity: { $sum: '$quantityOnHand' }, cells: { $sum: 1 } } },
      { $lookup: { from: Customer.collection.name, localField: '_id', foreignField: '_id', as: 'customer' } },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      { $sort: { totalQuantity: -1 } },
    ]),
  ]);

  const o = overall[0] || { totalQuantity: 0, cells: 0 };
  return {
    totalComponentsOnHand: o.totalQuantity,
    partCellCount: o.cells, // distinct (customer, product, part) cells
    byCustomer: byCustomer.map((c) => ({
      customerId: c._id ? c._id.toString() : null,
      customer: c.customer ? c.customer.name : null,
      totalQuantity: c.totalQuantity,
      partCellCount: c.cells,
    })),
  };
}

// Component aging: bucket each stock cell by the age (days) of its last movement
// (updatedAt). $$NOW keeps the clock server-side so the buckets are reproducible.
async function getInventoryAging() {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const rows = await ComponentStockItem.aggregate([
    {
      $addFields: {
        ageDays: { $divide: [{ $subtract: ['$$NOW', '$updatedAt'] }, DAY_MS] },
      },
    },
    {
      $addFields: {
        bucket: {
          $switch: {
            branches: [
              { case: { $lt: ['$ageDays', 7] }, then: '0-7d' },
              { case: { $lt: ['$ageDays', 30] }, then: '7-30d' },
              { case: { $lt: ['$ageDays', 90] }, then: '30-90d' },
            ],
            default: '90d+',
          },
        },
      },
    },
    {
      $group: {
        _id: '$bucket',
        quantity: { $sum: '$quantityOnHand' },
        cells: { $sum: 1 },
      },
    },
  ]);

  // Normalize to a stable, ordered set of buckets even when some are empty.
  const order = ['0-7d', '7-30d', '30-90d', '90d+'];
  const map = Object.fromEntries(rows.map((r) => [r._id, { quantity: r.quantity, cells: r.cells }]));
  return {
    buckets: order.map((label) => ({
      bucket: label,
      quantity: map[label] ? map[label].quantity : 0,
      cells: map[label] ? map[label].cells : 0,
    })),
  };
}

// Low inventory alerts: component cells at or below a threshold (default 100).
// No per-part reorder level is modelled yet, so the threshold is a query param.
async function getLowStock(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  let threshold = parseInt(query.threshold, 10);
  if (!Number.isFinite(threshold) || threshold < 0) threshold = 100;

  const filter = { quantityOnHand: { $lte: threshold } };
  const [rows, total] = await Promise.all([
    ComponentStockItem.aggregate([
      { $match: filter },
      { $sort: { quantityOnHand: 1 } },
      { $skip: skip },
      { $limit: limit },
      { $lookup: { from: Customer.collection.name, localField: 'customerId', foreignField: '_id', as: 'customer' } },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: Product.collection.name, localField: 'productId', foreignField: '_id', as: 'product' } },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    ]),
    ComponentStockItem.countDocuments(filter),
  ]);

  const data = rows.map((r) => ({
    customerId: r.customerId ? r.customerId.toString() : null,
    customer: r.customer ? r.customer.name : null,
    productId: r.productId ? r.productId.toString() : null,
    product: r.product ? r.product.name : null,
    itemCode: r.product ? r.product.itemCode || null : null,
    partName: r.partName,
    quantityOnHand: r.quantityOnHand,
  }));

  return { ...buildList(data, total, page, limit), threshold };
}

// ---------------------------------------------------------------------------
// GET /admin/quality/qc — QC approval & rejection rates (Phase 7)
// ---------------------------------------------------------------------------
async function getQcQuality() {
  const [agg] = await QCRecord.aggregate([
    {
      $group: {
        _id: null,
        inspected: { $sum: '$sampleSize' },
        accepted: { $sum: '$acceptedQuantity' },
        rejected: { $sum: '$rejectedQuantity' },
      },
    },
  ]);
  const a = agg || { inspected: 0, accepted: 0, rejected: 0 };
  const classified = a.accepted + a.rejected;
  return {
    inspectedQuantity: a.inspected,
    acceptedQuantity: a.accepted,
    rejectedQuantity: a.rejected,
    approvalRatePct: classified > 0 ? Math.round((a.accepted / classified) * 100) : 0,
    rejectionRatePct: classified > 0 ? Math.round((a.rejected / classified) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// GET /admin/dispatch/summary — pending vs dispatched (Phase 7)
// ---------------------------------------------------------------------------
//
// Pending Dispatch = finished goods still on hand (approved, not yet shipped).
// Dispatched Quantity = total shipped across all dispatch records.
async function getDispatchSummary() {
  const [pendingAgg, dispatched] = await Promise.all([
    FinishedGoodsItem.aggregate([
      { $group: { _id: null, pending: { $sum: '$quantityOnHand' } } },
    ]),
    sumField(PackingDispatchRecord, 'packedQuantity'),
  ]);
  return {
    pendingDispatchQuantity: pendingAgg[0] ? pendingAgg[0].pending : 0,
    dispatchedQuantity: dispatched.total,
    dispatchRecordCount: dispatched.count,
  };
}

// ---------------------------------------------------------------------------
// GET /admin/orders/:id/timeline — full per-order dept breakdown for one order
// ---------------------------------------------------------------------------
async function getOrderTimeline(id) {
  const mongoose = require('mongoose');
  if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid order id', 'invalid_id');

  const pipeline = [
    { $match: { _id: new mongoose.Types.ObjectId(id) } },
    ...orderEnrichmentStages(),
    {
      $addFields: {
        mouldingGoodParts: pick('$moulding.total'),
        assembledQuantity: pick('$assembly.total'),
        qcAcceptedQuantity: pick('$qc.total'),
        dispatchedQty: pick('$dispatch.total'),
      },
    },
  ];

  const [o] = await Order.aggregate(pipeline);
  if (!o) throw notFound('Order not found', 'order_not_found');

  return {
    ...shapeOrderRow(o),
    mouldingCount: o.mouldingCount || 0,
    assemblyCount: o.assemblyCount || 0,
    qcCount: o.qcCount || 0,
    dispatchCount: o.dispatchCount || 0,
    mouldingGoodParts: o.mouldingGoodParts || 0,
    assembledQuantity: o.assembledQuantity || 0,
    qcAcceptedQuantity: o.qcAcceptedQuantity || 0,
    productionCompletedAt: o.productionCompletedAt ?? null,
    assemblyCompletedAt: o.assemblyCompletedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// GET /admin/records/moulding | assembly | qc | dispatch — paginated dept records
// ---------------------------------------------------------------------------

function buildRecordFilter(query, mongoose) {
  const match = {};
  for (const key of ['customerId', 'productId', 'orderId']) {
    if (query[key] && mongoose.Types.ObjectId.isValid(query[key]))
      match[key] = new mongoose.Types.ObjectId(query[key]);
  }
  if (query.shift) match.shift = query.shift;
  return match;
}

async function listAdminMouldingRecords(query = {}) {
  const mongoose = require('mongoose');
  const { page, limit, skip } = parsePagination(query);
  const match = buildRecordFilter(query, mongoose);

  const [items, total] = await Promise.all([
    MouldingRecord.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $lookup: { from: Customer.collection.name, localField: 'customerId', foreignField: '_id', as: 'customer' } },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: Product.collection.name, localField: 'productId', foreignField: '_id', as: 'product' } },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: Order.collection.name, localField: 'orderId', foreignField: '_id', as: 'order' } },
      { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
    ]),
    MouldingRecord.countDocuments(match),
  ]);

  const data = items.map((r) => ({
    id: r._id.toString(),
    orderId: r.orderId ? r.orderId.toString() : null,
    orderCode: r.order ? r.order.orderCode : null,
    customerId: r.customerId ? r.customerId.toString() : null,
    customer: r.customer ? r.customer.name : null,
    productId: r.productId ? r.productId.toString() : null,
    product: r.product ? r.product.name : null,
    itemCode: r.product ? r.product.itemCode || null : null,
    moldName: r.moldName,
    partName: r.partName,
    machineNumber: r.machineNumber,
    shift: r.shift,
    cavity: r.cavity,
    shotsDone: r.shotsDone,
    rejectedShots: r.rejectedShots || 0,
    goodParts: r.goodParts,
    productionQuantity: r.productionQuantity,
    rejectionReasons: r.rejectionReasons || [],
    createdAt: r.createdAt,
  }));

  return buildList(data, total, page, limit);
}

async function listAdminAssemblyRecords(query = {}) {
  const mongoose = require('mongoose');
  const { page, limit, skip } = parsePagination(query);
  const match = buildRecordFilter(query, mongoose);

  const [items, total] = await Promise.all([
    AssemblyRecord.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $lookup: { from: Customer.collection.name, localField: 'customerId', foreignField: '_id', as: 'customer' } },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: Product.collection.name, localField: 'productId', foreignField: '_id', as: 'product' } },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: Order.collection.name, localField: 'orderId', foreignField: '_id', as: 'order' } },
      { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
    ]),
    AssemblyRecord.countDocuments(match),
  ]);

  const data = items.map((r) => ({
    id: r._id.toString(),
    orderId: r.orderId ? r.orderId.toString() : null,
    orderCode: r.order ? r.order.orderCode : null,
    customerId: r.customerId ? r.customerId.toString() : null,
    customer: r.customer ? r.customer.name : null,
    productId: r.productId ? r.productId.toString() : null,
    product: r.product ? r.product.name : null,
    itemCode: r.product ? r.product.itemCode || null : null,
    assemblyLine: r.assemblyLine,
    operatorCount: r.operatorCount,
    shift: r.shift,
    inputQuantity: r.inputQuantity,
    assembledSets: r.assembledSets,
    assembledQuantity: r.assembledQuantity,
    rejectedQuantity: r.rejectedQuantity,
    rejectionReason: r.rejectionReason || null,
    createdAt: r.createdAt,
  }));

  return buildList(data, total, page, limit);
}

async function listAdminQCRecords(query = {}) {
  const mongoose = require('mongoose');
  const { page, limit, skip } = parsePagination(query);
  const match = buildRecordFilter(query, mongoose);

  const [items, total] = await Promise.all([
    QCRecord.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $lookup: { from: Customer.collection.name, localField: 'customerId', foreignField: '_id', as: 'customer' } },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: Product.collection.name, localField: 'productId', foreignField: '_id', as: 'product' } },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: Order.collection.name, localField: 'orderId', foreignField: '_id', as: 'order' } },
      { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
    ]),
    QCRecord.countDocuments(match),
  ]);

  const data = items.map((r) => ({
    id: r._id.toString(),
    orderId: r.orderId ? r.orderId.toString() : null,
    orderCode: r.order ? r.order.orderCode : null,
    customerId: r.customerId ? r.customerId.toString() : null,
    customer: r.customer ? r.customer.name : null,
    productId: r.productId ? r.productId.toString() : null,
    product: r.product ? r.product.name : null,
    itemCode: r.product ? r.product.itemCode || null : null,
    inspectionDate: r.inspectionDate,
    inspectionType: r.inspectionType,
    sampleSize: r.sampleSize,
    acceptedQuantity: r.acceptedQuantity,
    rejectedQuantity: r.rejectedQuantity,
    defectCount: r.defectCount,
    defects: r.defects || [],
    remarks: r.remarks || null,
    createdAt: r.createdAt,
  }));

  return buildList(data, total, page, limit);
}

async function listAdminDispatchRecords(query = {}) {
  const mongoose = require('mongoose');
  const { page, limit, skip } = parsePagination(query);
  const match = buildRecordFilter(query, mongoose);

  const [items, total] = await Promise.all([
    PackingDispatchRecord.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $lookup: { from: Customer.collection.name, localField: 'customerId', foreignField: '_id', as: 'customer' } },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: Product.collection.name, localField: 'productId', foreignField: '_id', as: 'product' } },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: Order.collection.name, localField: 'orderId', foreignField: '_id', as: 'order' } },
      { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
    ]),
    PackingDispatchRecord.countDocuments(match),
  ]);

  const data = items.map((r) => ({
    id: r._id.toString(),
    orderId: r.orderId ? r.orderId.toString() : null,
    orderCode: r.order ? r.order.orderCode : null,
    customerId: r.customerId ? r.customerId.toString() : null,
    customer: r.customer ? r.customer.name : null,
    productId: r.productId ? r.productId.toString() : null,
    product: r.product ? r.product.name : null,
    itemCode: r.product ? r.product.itemCode || null : null,
    dispatchDate: r.dispatchDate,
    packedQuantity: r.packedQuantity,
    cartonCount: r.cartonCount,
    transporterName: r.transporterName,
    vehicleNumber: r.vehicleNumber,
    lrNumber: r.lrNumber,
    invoiceNumber: r.invoiceNumber,
    dispatchRemarks: r.dispatchRemarks || null,
    createdAt: r.createdAt,
  }));

  return buildList(data, total, page, limit);
}

module.exports = {
  getDashboard,
  getProductionSummary,
  getRejections,
  getDepartments,
  listOrders,
  listDelayedOrders,
  getCustomerAnalytics,
  getUserAnalytics,
  getProductionByCustomer,
  getProductionByProduct,
  getProductionByMold,
  getInventorySummary,
  getInventoryAging,
  getLowStock,
  getQcQuality,
  getDispatchSummary,
  getOrderTimeline,
  listAdminMouldingRecords,
  listAdminAssemblyRecords,
  listAdminQCRecords,
  listAdminDispatchRecords,
};
