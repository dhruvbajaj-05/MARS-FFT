'use strict';

const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const OrderMold = require('../models/OrderMold');
const MouldingRecord = require('../models/MouldingRecord');
const { badRequest, notFound } = require('../utils/httpError');

// ---------------------------------------------------------------------------
// Production Store — TWO live views of the SAME source (moulding records), for a PO.
//   • Item Code Store:  PO → Item Code → Mould   (per-item-code traceability)
//   • PO Cumulative:    PO → Mould (aggregated across item codes using the SAME physical
//                       mould, keyed by stable Mould ID = moldName, never by cavity)
// Nothing is stored — both views are computed from MouldingRecord (good parts) + OrderMold
// (target). Surplus = production overage vs target = max(0, producedGood − requiredShots×cavity).
// This never touches the assembly-facing Component Store / reconcile engine.
// ---------------------------------------------------------------------------

// Compute one row per (item-code job, mould) for a PO. Shared by both views.
async function computePoMouldRows(purchaseOrderId) {
  if (!mongoose.Types.ObjectId.isValid(purchaseOrderId)) {
    throw badRequest('Invalid purchase order id', 'invalid_id');
  }
  const po = await PurchaseOrder.findById(purchaseOrderId).lean();
  if (!po) throw notFound('Purchase order not found', 'purchase_order_not_found');

  const [customer, jobs] = await Promise.all([
    Customer.findById(po.customerId).select('name').lean(),
    Order.find({ purchaseOrderId: po._id }).sort({ createdAt: 1 }).lean(),
  ]);
  const jobIds = jobs.map((j) => j._id);
  const productIds = [...new Set(jobs.map((j) => String(j.productId)))];

  const [products, orderMolds, prodAgg] = await Promise.all([
    Product.find({ _id: { $in: productIds } }).select('name itemCode').lean(),
    OrderMold.find({ orderId: { $in: jobIds } }).lean(),
    MouldingRecord.aggregate([
      { $match: { orderId: { $in: jobIds } } },
      {
        $group: {
          _id: { orderId: '$orderId', moldName: '$moldName' },
          produced: { $sum: '$goodParts' },
          shots: { $sum: '$shotsDone' },
          partName: { $first: '$partName' },
          cavity: { $first: '$cavity' },
        },
      },
    ]),
  ]);

  const pById = new Map(products.map((p) => [String(p._id), p]));
  const targetByKey = new Map(orderMolds.map((m) => [`${m.orderId}|${m.moldName}`, m]));
  const prodByKey = new Map(prodAgg.map((r) => [`${r._id.orderId}|${r._id.moldName}`, r]));

  // Per-job identity (item code + product) — needed even for jobs with no moulds yet.
  const jobInfo = jobs.map((job) => {
    const p = pById.get(String(job.productId));
    return { orderId: String(job._id), itemCode: p ? p.itemCode || null : null, productName: p ? p.name : null };
  });

  // A row exists for every mould that either has a configured target OR recorded production.
  const rows = [];
  for (const job of jobs) {
    const info = jobInfo.find((j) => j.orderId === String(job._id));
    const moldNames = new Set();
    for (const m of orderMolds) if (String(m.orderId) === String(job._id)) moldNames.add(m.moldName);
    for (const r of prodAgg) if (String(r._id.orderId) === String(job._id)) moldNames.add(r._id.moldName);
    for (const moldName of moldNames) {
      const t = targetByKey.get(`${job._id}|${moldName}`);
      const pr = prodByKey.get(`${job._id}|${moldName}`);
      const produced = pr ? pr.produced || 0 : 0;
      const cavity = (t && t.cavity) || (pr && pr.cavity) || 1;
      const partName = (t && t.partName) || (pr && pr.partName) || '';
      const requiredPieces = t ? (t.requiredShots || 0) * (t.cavity || 1) : 0;
      const surplus = requiredPieces > 0 ? Math.max(0, produced - requiredPieces) : 0;
      rows.push({
        orderId: String(job._id),
        itemCode: info.itemCode,
        productName: info.productName,
        moldName,
        partName,
        cavity,
        produced,
        requiredPieces,
        surplus,
      });
    }
  }

  return {
    purchaseOrder: {
      id: String(po._id),
      poNumber: po.poNumber || null,
      customerId: String(po.customerId),
      customerName: customer ? customer.name : null,
    },
    jobInfo,
    rows,
  };
}

// VIEW 1 — Item Code Store: PO → Item Code → Mould.
async function getItemCodeStore(purchaseOrderId) {
  const { purchaseOrder, jobInfo, rows } = await computePoMouldRows(purchaseOrderId);
  const byJob = new Map();
  for (const r of rows) {
    if (!byJob.has(r.orderId)) byJob.set(r.orderId, []);
    byJob.get(r.orderId).push(r);
  }
  const items = jobInfo.map((info) => {
    const moulds = (byJob.get(info.orderId) || [])
      .map((r) => ({
        moldName: r.moldName,
        partName: r.partName,
        cavity: r.cavity,
        produced: r.produced,
        requiredPieces: r.requiredPieces,
        surplus: r.surplus,
      }))
      .sort((a, b) => a.moldName.localeCompare(b.moldName));
    return {
      orderId: info.orderId,
      itemCode: info.itemCode,
      productName: info.productName,
      moulds,
      totalProduced: moulds.reduce((s, m) => s + m.produced, 0),
      totalSurplus: moulds.reduce((s, m) => s + m.surplus, 0),
    };
  });
  return { purchaseOrder, items };
}

// VIEW 2 — PO Cumulative Store: PO → Mould (aggregated across item codes by stable moldName).
async function getPOCumulativeStore(purchaseOrderId) {
  const { purchaseOrder, rows } = await computePoMouldRows(purchaseOrderId);
  const byMold = new Map();
  for (const r of rows) {
    if (!byMold.has(r.moldName)) {
      byMold.set(r.moldName, { moldName: r.moldName, cavity: r.cavity, totalProduced: 0, totalSurplus: 0, breakdown: [] });
    }
    const m = byMold.get(r.moldName);
    m.totalProduced += r.produced;
    m.totalSurplus += r.surplus;
    // Traceability: which item code contributed how much.
    m.breakdown.push({
      orderId: r.orderId,
      itemCode: r.itemCode,
      productName: r.productName,
      produced: r.produced,
      surplus: r.surplus,
    });
  }
  const moulds = [...byMold.values()].sort((a, b) => a.moldName.localeCompare(b.moldName));
  return { purchaseOrder, moulds };
}

module.exports = { getItemCodeStore, getPOCumulativeStore };
