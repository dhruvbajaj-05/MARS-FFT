'use strict';

const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Counter = require('../models/Counter');
const orderService = require('./order.service');
const reconcileService = require('./reconcile.service');
const { notFound, badRequest, conflict } = require('../utils/httpError');
const { parsePagination, buildList } = require('../utils/pagination');

// The Purchase Order container. A PO groups several independent Item Code production jobs
// (each a normal Order). Creating a PO reuses order.service.createOrder per line, so the
// proven orderCode minting + reconcile wiring runs unchanged for every job.

const PO_SEQ = 'poNumber';
const PO_PREFIX = 'PO-';
const PO_PAD = 5;

function formatPoNumber(seq) {
  return `${PO_PREFIX}${String(seq).padStart(PO_PAD, '0')}`;
}

async function nextPoNumber() {
  const seq = await Counter.nextSeq(PO_SEQ);
  return formatPoNumber(seq);
}

// Derive the PO lifecycle from its jobs: Completed once every job is Completed (or Archived),
// otherwise Open. Never auto-clears a manual Archive.
function derivePoStatus(jobs) {
  if (jobs.length === 0) return 'Open';
  const allDone = jobs.every((j) => j.status === 'Completed' || j.status === 'Archived');
  return allDone ? 'Completed' : 'Open';
}

function toPublicPO(po, extra = {}) {
  return {
    id: po._id.toString(),
    poNumber: po.poNumber || null,
    customerId: po.customerId ? po.customerId.toString() : null,
    status: po.status,
    notes: po.notes || null,
    completedAt: po.completedAt || null,
    archivedAt: po.archivedAt || null,
    createdBy: po.createdBy ? po.createdBy.toString() : null,
    createdAt: po.createdAt,
    ...extra,
  };
}

// Shape one Item Code job (Order + its product identity) for PO responses.
function toPublicJob(order, product) {
  return {
    ...orderService.toPublicOrder(order),
    itemCode: product ? product.itemCode || null : null,
    productName: product ? product.name : null,
    partName: product ? product.partName || null : null,
  };
}

// Validate the { productId, orderQuantity } lines up front so we never mint a PO and then
// fail halfway through creating jobs.
async function validateLines(customerId, lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw badRequest('A purchase order needs at least one item code line', 'no_lines');
  }
  const productIds = lines.map((l) => l && l.productId);
  for (const id of productIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw badRequest('Each line needs a valid productId', 'invalid_product');
    }
  }
  const products = await Product.find({ _id: { $in: productIds } });
  const byId = new Map(products.map((p) => [String(p._id), p]));
  for (const line of lines) {
    const product = byId.get(String(line.productId));
    if (!product) {
      throw badRequest('A line references a product that does not exist', 'invalid_product');
    }
    if (product.customerId.toString() !== String(customerId)) {
      throw badRequest(
        `Item code ${product.itemCode || product.name} does not belong to this customer`,
        'product_customer_mismatch'
      );
    }
    const qty = Number(line.orderQuantity);
    if (!Number.isFinite(qty) || qty < 0) {
      throw badRequest('Each line needs an orderQuantity >= 0', 'invalid_quantity');
    }
  }
  return byId;
}

// Create a PO and one Item Code job per line. Optimized for speed: all jobs are minted +
// inserted in bulk (one code-block reservation + one insertMany), and stores are reconciled
// ONCE per distinct product in parallel — instead of the old 2×N sequential reconciles that
// made PO creation feel slow (and let admins double-submit). Reconcile is best-effort: a new
// job has no production yet, it only draws down any existing product surplus.
async function createPurchaseOrder({ customerId, lines, notes, createdBy }) {
  const customerExists = await Customer.exists({ _id: customerId });
  if (!customerExists) {
    throw badRequest('customerId does not reference an existing customer', 'invalid_customer');
  }
  const byId = await validateLines(customerId, lines); // validates products/quantities up front

  const po = await PurchaseOrder.create({
    poNumber: await nextPoNumber(),
    customerId,
    notes: notes ? String(notes).trim() : undefined,
    createdBy,
  });

  // Reserve all OrderIDs in one atomic op, then bulk-insert the jobs.
  const codes = await orderService.nextOrderCodesBatch(lines.length);
  const docs = lines.map((line, i) => ({
    orderCode: codes[i],
    purchaseOrderId: po._id,
    customerId,
    productId: line.productId,
    orderQuantity: Number(line.orderQuantity),
    createdBy,
  }));
  const created = await Order.insertMany(docs);

  // Reconcile once per DISTINCT product, all in parallel (best-effort — never block the PO).
  const uniqueProductIds = [...new Set(lines.map((l) => String(l.productId)))];
  await Promise.all(
    uniqueProductIds.map((pid) =>
      Promise.all([
        reconcileService.reconcileProduct(String(customerId), pid),
        reconcileService.reconcileOutsourced(String(customerId), pid),
      ]).catch((e) => console.warn('[po] reconcile failed:', e.message))
    )
  );

  const jobs = created.map((o) => toPublicJob(o, byId.get(String(o.productId))));
  return { purchaseOrder: toPublicPO(po, { jobCount: jobs.length }), jobs };
}

// List POs (filter customer/status), enriched with customer name + job roll-up.
async function listPurchaseOrders(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.customerId) filter.customerId = query.customerId;
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    PurchaseOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PurchaseOrder.countDocuments(filter),
  ]);
  if (items.length === 0) return buildList([], total, page, limit);

  const poIds = items.map((p) => p._id);
  const customerIds = [...new Set(items.map((p) => String(p.customerId)))];
  const [customers, jobAgg] = await Promise.all([
    Customer.find({ _id: { $in: customerIds } }).select('name').lean(),
    Order.aggregate([
      { $match: { purchaseOrderId: { $in: poIds } } },
      {
        $group: {
          _id: '$purchaseOrderId',
          jobCount: { $sum: 1 },
          totalQuantity: { $sum: '$orderQuantity' },
          completedJobs: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const cName = new Map(customers.map((c) => [String(c._id), c.name]));
  const jMap = new Map(jobAgg.map((j) => [String(j._id), j]));

  const data = items.map((po) => {
    const j = jMap.get(String(po._id)) || { jobCount: 0, totalQuantity: 0, completedJobs: 0 };
    return toPublicPO(po, {
      customerName: cName.get(String(po.customerId)) || null,
      jobCount: j.jobCount,
      completedJobs: j.completedJobs,
      totalQuantity: j.totalQuantity,
    });
  });
  return buildList(data, total, page, limit);
}

async function loadPO(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw badRequest('Invalid purchase order id', 'invalid_id');
  }
  const po = await PurchaseOrder.findById(id);
  if (!po) throw notFound('Purchase order not found', 'purchase_order_not_found');
  return po;
}

// One PO with all its Item Code jobs (each with product identity + lifecycle flags). Also
// lazily persists the derived PO status so listing stays cheap and correct.
async function getPurchaseOrder(id) {
  const po = await loadPO(id);
  const [customer, orders] = await Promise.all([
    Customer.findById(po.customerId).select('name').lean(),
    Order.find({ purchaseOrderId: po._id }).sort({ createdAt: 1 }),
  ]);

  const productIds = [...new Set(orders.map((o) => String(o.productId)))];
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const pById = new Map(products.map((p) => [String(p._id), p]));
  const jobs = orders.map((o) => toPublicJob(o, pById.get(String(o.productId))));

  // Keep the cached PO status in sync with its jobs (Archived is manual, never overwritten).
  const derived = derivePoStatus(orders);
  if (po.status !== 'Archived' && po.status !== derived) {
    po.status = derived;
    po.completedAt = derived === 'Completed' ? po.completedAt || new Date() : null;
    await po.save();
  }

  return {
    purchaseOrder: toPublicPO(po, {
      customerName: customer ? customer.name : null,
      jobCount: jobs.length,
    }),
    jobs,
  };
}

// Add another Item Code job to an existing PO.
async function addLine(id, { productId, orderQuantity }) {
  const po = await loadPO(id);
  if (po.status === 'Archived') {
    throw conflict('Cannot add item codes to an archived purchase order', 'po_archived');
  }
  const byId = await validateLines(po.customerId, [{ productId, orderQuantity }]);
  const job = await orderService.createOrder({
    customerId: po.customerId,
    productId,
    orderQuantity,
    purchaseOrderId: po._id,
    createdBy: po.createdBy,
  });
  // A new (incomplete) job re-opens the PO.
  if (po.status === 'Completed') {
    po.status = 'Open';
    po.completedAt = null;
    await po.save();
  }
  // Return the POJob shape (job + product identity) the client expects.
  const product = byId.get(String(productId));
  return {
    ...job,
    itemCode: product ? product.itemCode || null : null,
    productName: product ? product.name : null,
    partName: product ? product.partName || null : null,
  };
}

// Remove one Item Code job from a PO (blocked by order.service when it has records).
async function removeLine(id, jobId) {
  const po = await loadPO(id);
  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    throw badRequest('Invalid job id', 'invalid_id');
  }
  const job = await Order.findOne({ _id: jobId, purchaseOrderId: po._id });
  if (!job) throw notFound('Item code job not found on this purchase order', 'job_not_found');
  return orderService.deleteOrder(job._id); // guards records + reconciles
}

// Edit PO notes / archive state.
async function updatePurchaseOrder(id, { notes, status }) {
  const po = await loadPO(id);
  if (notes !== undefined) po.notes = notes ? String(notes).trim() : undefined;
  if (status !== undefined) {
    if (!PurchaseOrder.STATUSES.includes(status)) {
      throw badRequest(`status must be one of: ${PurchaseOrder.STATUSES.join(', ')}`, 'invalid_status');
    }
    po.status = status;
    po.archivedAt = status === 'Archived' ? new Date() : null;
  }
  await po.save();
  return toPublicPO(po);
}

// Delete a PO and all its jobs. Blocked (409) if any job has production records, so history
// is never orphaned; each clean job is removed via order.service (reconcile + cleanup).
async function deletePurchaseOrder(id) {
  const po = await loadPO(id);
  const jobs = await Order.find({ purchaseOrderId: po._id }).select('_id orderCode');
  for (const job of jobs) {
    // deleteOrder throws 409 when the job has records — surfaces as a clean, actionable error.
    await orderService.deleteOrder(job._id);
  }
  await PurchaseOrder.deleteOne({ _id: po._id });
  return { id: String(id), deleted: true };
}

module.exports = {
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  addLine,
  removeLine,
  updatePurchaseOrder,
  deletePurchaseOrder,
  toPublicPO,
  nextPoNumber,
  formatPoNumber,
};
