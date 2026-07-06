'use strict';

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Counter = require('../models/Counter');
const MouldingRecord = require('../models/MouldingRecord');
const AssemblyRecord = require('../models/AssemblyRecord');
const QCRecord = require('../models/QCRecord');
const PackingDispatchRecord = require('../models/PackingDispatchRecord');
const OrderMold = require('../models/OrderMold');
const OutsourcedComponentItem = require('../models/OutsourcedComponentItem');
const ComponentStockItem = require('../models/ComponentStockItem');
const StockLedgerEntry = require('../models/StockLedgerEntry');
const { notFound, badRequest, conflict } = require('../utils/httpError');
const { parsePagination, buildList } = require('../utils/pagination');
const reconcileService = require('./reconcile.service');

// Count production records that reference an order across every department.
async function countOrderRecords(orderId) {
  const [moulding, assembly, qc, dispatch] = await Promise.all([
    MouldingRecord.countDocuments({ orderId }),
    AssemblyRecord.countDocuments({ orderId }),
    QCRecord.countDocuments({ orderId }),
    PackingDispatchRecord.countDocuments({ orderId }),
  ]);
  return { moulding, assembly, qc, dispatch, total: moulding + assembly + qc + dispatch };
}

const ORDER_CODE_SEQ = 'orderCode';
const ORDER_CODE_PREFIX = 'FFT-';
const ORDER_CODE_PAD = 5;

// Format a numeric sequence value into the FFT-00001 OrderID.
function formatOrderCode(seq) {
  return `${ORDER_CODE_PREFIX}${String(seq).padStart(ORDER_CODE_PAD, '0')}`;
}

// Mint the next sequential, unique OrderID (atomic via the Counter sequence).
async function nextOrderCode() {
  const seq = await Counter.nextSeq(ORDER_CODE_SEQ);
  return formatOrderCode(seq);
}

// Shape an order document for client responses. Produced/Pending/Progress are computed
// at read time elsewhere — not stored. orderCode + lifecycle flags drive the working
// screens vs history split.
function toPublicOrder(order) {
  return {
    id: order._id.toString(),
    orderCode: order.orderCode || null,
    customerId: order.customerId ? order.customerId.toString() : null,
    productId: order.productId ? order.productId.toString() : null,
    orderQuantity: order.orderQuantity,
    status: order.status,
    productionStatus: order.productionStatus,
    assemblyStatus: order.assemblyStatus,
    productionCompletedAt: order.productionCompletedAt || null,
    assemblyCompletedAt: order.assemblyCompletedAt || null,
    completedAt: order.completedAt || null,
    archivedAt: order.archivedAt || null,
    createdBy: order.createdBy ? order.createdBy.toString() : null,
    createdAt: order.createdAt,
  };
}

// Create an order (admin only). Validates the customer → product chain so an order can
// never point at a product that belongs to a different customer, then mints a unique
// sequential OrderID (FFT-#####).
async function createOrder({ customerId, productId, orderQuantity, createdBy }) {
  const quantity = Number(orderQuantity);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw badRequest('orderQuantity must be a number >= 0', 'invalid_quantity');
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw badRequest('productId does not reference an existing product', 'invalid_product');
  }
  if (product.customerId.toString() !== String(customerId)) {
    throw badRequest('productId does not belong to the given customerId', 'product_customer_mismatch');
  }

  const orderCode = await nextOrderCode();
  const order = await Order.create({
    orderCode,
    customerId,
    productId,
    orderQuantity: quantity,
    createdBy,
  });

  // Reconcile so any existing product surplus (moulded + outsourced) is drawn down against
  // this new order's requirement FIRST (oldest order wins), leaving only the shortfall to be
  // produced/purchased. Outsourced components are added per-order by the engineer (no master
  // BOM). Best-effort — never block order creation.
  try {
    await reconcileService.reconcileProduct(order.customerId.toString(), order.productId.toString());
    await reconcileService.reconcileOutsourced(order.customerId.toString(), order.productId.toString());
  } catch (e) {
    console.warn('[order] reconcile failed:', e.message);
  }

  return toPublicOrder(order);
}

// List orders, with cascading-dropdown + workspace filters:
//   productId / customerId   → master-data cascade
//   orderCode                → case-insensitive prefix search (e.g. "FFT-000")
//   status                   → Active | Completed | Archived (overall lifecycle)
//   productionStatus         → Active | Completed (Moulding workspace vs history)
//   assemblyStatus           → Active | Completed (Assembly workspace vs history)
async function listOrders(query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (query.productId) filter.productId = query.productId;
  if (query.customerId) filter.customerId = query.customerId;
  if (query.status) filter.status = query.status;
  if (query.productionStatus) filter.productionStatus = query.productionStatus;
  if (query.assemblyStatus) filter.assemblyStatus = query.assemblyStatus;
  if (query.orderCode) {
    const escaped = String(query.orderCode).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.orderCode = { $regex: escaped, $options: 'i' };
  }

  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);

  return buildList(items.map(toPublicOrder), total, page, limit);
}

// Fetch a single order document (raw) or throw 404. Shared by the public getter and the
// lifecycle transitions below.
async function loadOrder(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw badRequest('Invalid order id', 'invalid_id');
  }
  const order = await Order.findById(id);
  if (!order) {
    throw notFound('Order not found', 'order_not_found');
  }
  return order;
}

// Fetch a single order or throw 404.
async function getOrderById(id) {
  return toPublicOrder(await loadOrder(id));
}

// Recompute the overall lifecycle status from the two phase flags. An order is
// Completed once BOTH production and assembly are completed; Archived is never
// auto-cleared here (it is a deliberate, separate admin action).
function recomputeStatus(order) {
  if (order.status === 'Archived') return;
  if (order.productionStatus === 'Completed' && order.assemblyStatus === 'Completed') {
    order.status = 'Completed';
    if (!order.completedAt) order.completedAt = new Date();
  } else {
    order.status = 'Active';
    order.completedAt = null;
  }
}

// Admin: "Complete Production" — moulding workspace clears, its data becomes history
// under the OrderID. Records are never mutated or deleted; only the order flag flips.
async function completeProduction(id) {
  const order = await loadOrder(id);
  if (order.productionStatus !== 'Completed') {
    order.productionStatus = 'Completed';
    order.productionCompletedAt = new Date();
    recomputeStatus(order);
    await order.save();
  }
  return toPublicOrder(order);
}

// Admin: "Complete Assembly" — assembly workspace clears, data becomes history.
async function completeAssembly(id) {
  const order = await loadOrder(id);
  if (order.assemblyStatus !== 'Completed') {
    order.assemblyStatus = 'Completed';
    order.assemblyCompletedAt = new Date();
    recomputeStatus(order);
    await order.save();
  }
  return toPublicOrder(order);
}

// Admin: edit an order. orderQuantity can always be changed; product/customer may only be
// reassigned while the order has no production records (that would invalidate history).
// Any change re-runs reconcile so the outsourced requirement (orderQuantity × perSet) and
// surplus allocation stay exact.
async function updateOrder(id, { orderQuantity, productId, customerId }) {
  const order = await loadOrder(id);

  const wantsChain =
    (productId !== undefined && String(productId) !== String(order.productId)) ||
    (customerId !== undefined && String(customerId) !== String(order.customerId));

  if (wantsChain) {
    const { total } = await countOrderRecords(order._id);
    if (total > 0) {
      throw conflict(
        'Cannot change this order’s product/customer while it has production records. ' +
          'Only the order quantity can be edited.',
        'order_in_use'
      );
    }
    const nextProductId = productId !== undefined ? productId : order.productId;
    const nextCustomerId = customerId !== undefined ? customerId : order.customerId;
    const product = await Product.findById(nextProductId);
    if (!product) {
      throw badRequest('productId does not reference an existing product', 'invalid_product');
    }
    if (product.customerId.toString() !== String(nextCustomerId)) {
      throw badRequest('productId does not belong to the given customerId', 'product_customer_mismatch');
    }
    order.productId = nextProductId;
    order.customerId = nextCustomerId;
  }

  if (orderQuantity !== undefined) {
    const quantity = Number(orderQuantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw badRequest('orderQuantity must be a number >= 0', 'invalid_quantity');
    }
    order.orderQuantity = quantity;
  }

  await order.save();

  // Recompute the product's stores (outsourced requirement + surplus FIFO) after the edit.
  try {
    await reconcileService.reconcileProduct(order.customerId.toString(), order.productId.toString());
    await reconcileService.reconcileOutsourced(order.customerId.toString(), order.productId.toString());
  } catch (e) {
    console.warn('[order] reconcile after edit failed:', e.message);
  }

  return toPublicOrder(order);
}

// Admin: hard-delete an order. Blocked (409) when any department has recorded work against
// it, so production history is never orphaned. When clean, the order and its derived rows
// (mould setup, outsourced BOM snapshot, component cells, ledger) are removed and the
// product's stores are reconciled so any surplus auto-consumed at creation returns.
async function deleteOrder(id) {
  const order = await loadOrder(id);

  const counts = await countOrderRecords(order._id);
  if (counts.total > 0) {
    const parts = [];
    if (counts.moulding) parts.push(`${counts.moulding} moulding`);
    if (counts.assembly) parts.push(`${counts.assembly} assembly`);
    if (counts.qc) parts.push(`${counts.qc} QC`);
    if (counts.dispatch) parts.push(`${counts.dispatch} dispatch`);
    throw conflict(
      `Cannot delete ${order.orderCode || 'this order'} — it has ${parts.join(', ')} record(s). ` +
        'Delete those records first.',
      'order_in_use'
    );
  }

  const { customerId, productId } = order;

  await Promise.all([
    Order.deleteOne({ _id: order._id }),
    OrderMold.deleteMany({ orderId: order._id }),
    OutsourcedComponentItem.deleteMany({ orderId: order._id }),
    ComponentStockItem.deleteMany({ orderId: order._id }),
    StockLedgerEntry.deleteMany({ orderId: order._id }),
  ]);

  try {
    await reconcileService.reconcileAllForProduct(customerId.toString(), productId.toString());
  } catch (e) {
    console.warn('[order] reconcile after delete failed:', e.message);
  }

  return { id: String(id), deleted: true };
}

module.exports = {
  createOrder,
  listOrders,
  getOrderById,
  completeProduction,
  completeAssembly,
  updateOrder,
  deleteOrder,
  toPublicOrder,
  nextOrderCode,
  formatOrderCode,
};
