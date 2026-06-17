'use strict';

const mongoose = require('mongoose');
const ComponentStockItem = require('../models/ComponentStockItem');
const SurplusStockItem = require('../models/SurplusStockItem');
const FinishedGoodsItem = require('../models/FinishedGoodsItem');
const StockLedgerEntry = require('../models/StockLedgerEntry');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { badRequest, conflict } = require('../utils/httpError');
const { parsePagination, buildList } = require('../utils/pagination');

// ---------------------------------------------------------------------------
// Central store engine (Phases 2 / 4 / 5; revised: Component Store is ORDER-scoped).
//
// Two materialized balance tables (component + finished goods) backed by one
// append-only StockLedgerEntry audit trail. Every department that moves stock calls
// applyStockIn / applyStockOut here — the balances and the ledger always stay in step.
//   Moulding  → IN  COMPONENT       (good parts, into the order's bucket)
//   Assembly  → OUT COMPONENT       (assortment consumption, from the order's bucket)
//   QC        → IN  FINISHED_GOODS  (approved units, product-level)
//   Dispatch  → OUT FINISHED_GOODS  (shipped units, product-level, guarded)
// ---------------------------------------------------------------------------

const STORE = { COMPONENT: 'COMPONENT', SURPLUS: 'SURPLUS', FINISHED_GOODS: 'FINISHED_GOODS' };
const TXN = { IN: 'IN', OUT: 'OUT' };

function assertObjectId(value, name) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw badRequest(`A valid ${name} is required`, 'invalid_id');
  }
}

function assertPositiveQuantity(quantity) {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n <= 0) {
    throw badRequest('quantity must be a number > 0', 'invalid_quantity');
  }
  return n;
}

// ---- Derived Pending / Finished / Surplus for a component row ----------------
// Never stored, so it can never go stale. A row is Finished only once a positive
// Required Quantity target has been reached; Surplus is the overage beyond it.
//   finishedQuantity = min(onHand, required)   (or onHand when no target is set)
//   surplusQuantity  = max(0, onHand − required) when required > 0, else 0
function deriveComponentRow(item) {
  const required = item.requiredQuantity || 0;
  const onHand = item.quantityOnHand || 0;
  const hasTarget = required > 0;
  const finished = hasTarget && onHand >= required;
  return {
    status: finished ? 'finished' : 'pending',
    finishedQuantity: hasTarget ? Math.min(onHand, required) : onHand,
    surplusQuantity: hasTarget ? Math.max(0, onHand - required) : 0,
  };
}

// Project a raw stock item (lean doc or aggregation row) to the public part shape.
function toPartRow(i) {
  const derived = deriveComponentRow(i);
  return {
    partName: i.partName,
    moldName: i.moldName || '',
    cavity: i.cavity || 1,
    requiredQuantity: i.requiredQuantity || 0,
    quantityOnHand: i.quantityOnHand || 0,
    finishedQuantity: derived.finishedQuantity,
    surplusQuantity: derived.surplusQuantity,
    status: derived.status,
  };
}

// ---- Balance mutations (atomic; concurrency-safe via the unique balance index) ----

// Increment a component balance, creating the (customer, product, order, part) cell on
// first sight. The unique index can race two concurrent inserts → retry once on E11000.
// Also records the mold identity (moldName/cavity) and the per-order Required Quantity.
async function incComponentBalance({ customerId, productId, orderId, partName, moldName, cavity, requiredQuantity, quantity }) {
  const filter = { customerId, productId, orderId, partName };
  const set = {};
  if (moldName !== undefined && moldName !== null) set.moldName = String(moldName).trim();
  if (cavity !== undefined && cavity !== null) set.cavity = cavity;
  if (requiredQuantity !== undefined && requiredQuantity !== null) set.requiredQuantity = requiredQuantity;
  const update = { $inc: { quantityOnHand: quantity } };
  if (Object.keys(set).length > 0) update.$set = set;
  try {
    return await ComponentStockItem.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return ComponentStockItem.findOneAndUpdate(filter, update, { new: true });
    }
    throw err;
  }
}

// Increment the PRODUCT-LEVEL surplus balance for a part (customer, product, part).
// Same race-tolerant upsert pattern as the component balance. Surplus is never scoped
// by order — every order's over-production for the same part accumulates here.
async function incSurplusBalance({ customerId, productId, partName, moldName, cavity, quantity }) {
  const filter = { customerId, productId, partName };
  const set = {};
  if (moldName !== undefined && moldName !== null) set.moldName = String(moldName).trim();
  if (cavity !== undefined && cavity !== null) set.cavity = cavity;
  const update = { $inc: { quantityOnHand: quantity } };
  if (Object.keys(set).length > 0) update.$set = set;
  try {
    return await SurplusStockItem.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return SurplusStockItem.findOneAndUpdate(filter, update, { new: true });
    }
    throw err;
  }
}

async function incFinishedGoodsBalance({ customerId, productId, quantity }) {
  const filter = { customerId, productId };
  const update = { $inc: { quantityOnHand: quantity } };
  try {
    return await FinishedGoodsItem.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return FinishedGoodsItem.findOneAndUpdate(filter, update, { new: true });
    }
    throw err;
  }
}

// Guarded decrement: only succeeds while enough stock is on hand. The `quantityOnHand
// >= quantity` predicate inside the atomic update prevents overselling under races —
// if it returns null, there was not enough stock.
async function decBalance(Model, filter, quantity, label) {
  const updated = await Model.findOneAndUpdate(
    { ...filter, quantityOnHand: { $gte: quantity } },
    { $inc: { quantityOnHand: -quantity } },
    { new: true }
  );
  if (!updated) {
    const current = await Model.findOne(filter).lean();
    const available = current ? current.quantityOnHand : 0;
    throw conflict(
      `Insufficient ${label} stock: requested ${quantity}, available ${available}`,
      'insufficient_stock'
    );
  }
  return updated;
}

async function writeLedger(entry) {
  return StockLedgerEntry.create(entry);
}

// ---- Surplus transfer + consumption (assembly completion / extra sets) -------

// Move every remaining moulded component of a completed order into the PRODUCT-LEVEL
// moulded Surplus, matched by (customer, product, part) and ADDED to existing surplus.
// The order cell is zeroed (not deleted) so the order disappears from active Component
// Store views while its history (records + ledger + the zeroed cell) is preserved.
// Returns the per-part quantities that were transferred.
async function transferOrderComponentsToSurplus({ customerId, productId, orderId, createdBy }) {
  assertObjectId(customerId, 'customerId');
  assertObjectId(productId, 'productId');
  assertObjectId(orderId, 'orderId');

  const cells = await ComponentStockItem.find({ customerId, productId, orderId, quantityOnHand: { $gt: 0 } });
  const moved = [];
  for (const cell of cells) {
    const qty = cell.quantityOnHand;
    await incSurplusBalance({ customerId, productId, partName: cell.partName, moldName: cell.moldName, cavity: cell.cavity, quantity: qty });
    await writeLedger({
      storeType: STORE.COMPONENT, transactionType: TXN.OUT, customerId, productId, orderId,
      partName: cell.partName, quantity: qty, sourceModule: 'assembly',
      remarks: 'Assembly complete — remaining moved to product surplus', createdBy,
    });
    await writeLedger({
      storeType: STORE.SURPLUS, transactionType: TXN.IN, customerId, productId, orderId,
      partName: cell.partName, quantity: qty, sourceModule: 'assembly',
      remarks: 'Surplus transfer on assembly completion', createdBy,
    });
    cell.quantityOnHand = 0;
    await cell.save();
    moved.push({ partName: cell.partName, quantity: qty });
  }
  return moved;
}

// Consume from the PRODUCT-LEVEL moulded Surplus (extra sets produced from surplus).
// Guarded — throws 409 if there isn't enough surplus on hand.
async function consumeSurplus({ customerId, productId, partName, quantity, referenceId, remarks, createdBy }) {
  const qty = assertPositiveQuantity(quantity);
  const part = String(partName || '').trim();
  if (!part) throw badRequest('partName is required', 'missing_part');
  const balance = await decBalance(SurplusStockItem, { customerId, productId, partName: part }, qty, 'surplus');
  await writeLedger({
    storeType: STORE.SURPLUS, transactionType: TXN.OUT, customerId, productId, orderId: null,
    partName: part, quantity: qty, sourceModule: 'assembly',
    referenceId: referenceId || null, remarks: remarks || 'Extra set consumed surplus', createdBy,
  });
  return balance;
}

// ---- Public movement API -----------------------------------------------------

// Add stock (production / QC approval). COMPONENT movements are order-scoped (orderId
// required); FINISHED_GOODS movements are product-level. Returns the updated balance.
async function applyStockIn({
  storeType,
  customerId,
  productId,
  orderId,
  partName,
  moldName,
  cavity,
  requiredQuantity,
  quantity,
  sourceModule,
  referenceId,
  remarks,
  createdBy,
}) {
  const qty = assertPositiveQuantity(quantity);
  assertObjectId(customerId, 'customerId');
  assertObjectId(productId, 'productId');

  if (storeType === STORE.COMPONENT) {
    assertObjectId(orderId, 'orderId');
    const part = String(partName || '').trim();
    if (!part) {
      throw badRequest('partName is required for component stock', 'missing_part');
    }

    // Split production against the order's Required Quantity target. Only the portion that
    // fits within the target lands in the order's Pending/Finished cell; the OVERAGE spills
    // into the PRODUCT-LEVEL Surplus store so assembly (which consumes the order cell) can
    // never touch it. With no target set (required = 0) everything is order-scoped Pending.
    const existing = await ComponentStockItem.findOne({ customerId, productId, orderId, partName: part }).lean();
    const onHand = existing ? existing.quantityOnHand : 0;
    const required =
      requiredQuantity !== undefined && requiredQuantity !== null
        ? Number(requiredQuantity)
        : existing
          ? existing.requiredQuantity || 0
          : 0;

    let toCell = qty;
    let toSurplus = 0;
    if (required > 0) {
      const capacity = Math.max(0, required - onHand);
      toCell = Math.min(qty, capacity);
      toSurplus = qty - toCell;
    }

    // Always upsert the cell so the Required Quantity / mold / cavity stay current, even
    // when the whole push is surplus (toCell may be 0; $inc 0 is a safe no-op on an
    // already-existing, already-full cell).
    const balance = await incComponentBalance({
      customerId,
      productId,
      orderId,
      partName: part,
      moldName,
      cavity,
      requiredQuantity,
      quantity: toCell,
    });

    if (toCell > 0) {
      await writeLedger({
        storeType: STORE.COMPONENT,
        transactionType: TXN.IN,
        customerId,
        productId,
        orderId,
        partName: part,
        quantity: toCell,
        sourceModule,
        referenceId: referenceId || null,
        remarks,
        createdBy,
      });
    }

    if (toSurplus > 0) {
      await incSurplusBalance({ customerId, productId, partName: part, moldName, cavity, quantity: toSurplus });
      await writeLedger({
        storeType: STORE.SURPLUS,
        transactionType: TXN.IN,
        customerId,
        productId,
        orderId, // kept for traceability of which order over-produced
        partName: part,
        quantity: toSurplus,
        sourceModule,
        referenceId: referenceId || null,
        remarks: remarks ? `${remarks} (surplus overage)` : 'Surplus overage',
        createdBy,
      });
    }

    return balance;
  }

  if (storeType === STORE.FINISHED_GOODS) {
    const balance = await incFinishedGoodsBalance({ customerId, productId, quantity: qty });
    await writeLedger({
      storeType,
      transactionType: TXN.IN,
      customerId,
      productId,
      orderId: orderId || null,
      partName: null,
      quantity: qty,
      sourceModule,
      referenceId: referenceId || null,
      remarks,
      createdBy,
    });
    return balance;
  }

  throw badRequest(`Unknown storeType: ${storeType}`, 'invalid_store_type');
}

// Remove stock (assembly consumption; dispatch). COMPONENT movements are order-scoped.
// Throws 409 if the store does not hold enough. Returns the updated balance document.
async function applyStockOut({
  storeType,
  customerId,
  productId,
  orderId,
  partName,
  quantity,
  sourceModule,
  referenceId,
  remarks,
  createdBy,
}) {
  const qty = assertPositiveQuantity(quantity);
  assertObjectId(customerId, 'customerId');
  assertObjectId(productId, 'productId');

  let balance;
  if (storeType === STORE.COMPONENT) {
    assertObjectId(orderId, 'orderId');
    if (!partName || String(partName).trim() === '') {
      throw badRequest('partName is required for component stock', 'missing_part');
    }
    balance = await decBalance(
      ComponentStockItem,
      { customerId, productId, orderId, partName: String(partName).trim() },
      qty,
      'component'
    );
  } else if (storeType === STORE.FINISHED_GOODS) {
    balance = await decBalance(FinishedGoodsItem, { customerId, productId }, qty, 'finished goods');
  } else {
    throw badRequest(`Unknown storeType: ${storeType}`, 'invalid_store_type');
  }

  await writeLedger({
    storeType,
    transactionType: TXN.OUT,
    customerId,
    productId,
    orderId: storeType === STORE.COMPONENT ? orderId : (orderId || null),
    partName: storeType === STORE.COMPONENT ? String(partName).trim() : null,
    quantity: qty,
    sourceModule,
    referenceId: referenceId || null,
    remarks,
    createdBy,
  });

  return balance;
}

// ---- Read API: balances, availability, hierarchy ----------------------------

// Per-part availability for one product. Options:
//   orderId: <id>                   → scope to ONE order's buckets (Assembly works here)
//   status: 'finished' | 'pending'  → only rows in that derived state
//   positiveOnly: true              → drop rows with quantityOnHand <= 0 (active view)
// Without orderId, balances are aggregated across all of the product's orders (the
// product-level view used by the store controller + Customer Portal).
async function getComponentAvailability(customerId, productId, opts = {}) {
  assertObjectId(customerId, 'customerId');
  assertObjectId(productId, 'productId');

  let rows;
  if (opts.orderId) {
    assertObjectId(opts.orderId, 'orderId');
    rows = await ComponentStockItem.find({ customerId, productId, orderId: opts.orderId })
      .sort({ partName: 1 })
      .lean();
  } else {
    // Aggregate across orders: one row per part (sum on-hand + required).
    const agg = await ComponentStockItem.aggregate([
      {
        $match: {
          customerId: new mongoose.Types.ObjectId(customerId),
          productId: new mongoose.Types.ObjectId(productId),
        },
      },
      {
        $group: {
          _id: '$partName',
          partName: { $first: '$partName' },
          moldName: { $first: '$moldName' },
          cavity: { $first: '$cavity' },
          requiredQuantity: { $sum: '$requiredQuantity' },
          quantityOnHand: { $sum: '$quantityOnHand' },
        },
      },
      { $sort: { partName: 1 } },
    ]);
    rows = agg;
  }

  let parts = rows.map(toPartRow);
  if (opts.status) parts = parts.filter((p) => p.status === opts.status);
  if (opts.positiveOnly) parts = parts.filter((p) => p.quantityOnHand > 0);

  return {
    customerId: String(customerId),
    productId: String(productId),
    orderId: opts.orderId ? String(opts.orderId) : null,
    parts,
  };
}

async function getFinishedGoodsBalance(customerId, productId) {
  assertObjectId(customerId, 'customerId');
  assertObjectId(productId, 'productId');

  const item = await FinishedGoodsItem.findOne({ customerId, productId }).lean();
  return {
    customerId: String(customerId),
    productId: String(productId),
    quantityOnHand: item ? item.quantityOnHand : 0,
  };
}

// PRODUCT-LEVEL surplus rows, keyed `${customerId}|${productId}` → ComponentPart[].
// Surplus is the over-production store (separate from the order cells), accumulated per
// (customer, product, part) across ALL orders. Optional customerId/productId narrow it.
async function getSurplusByProduct({ customerId, productId } = {}) {
  const match = { quantityOnHand: { $gt: 0 } };
  if (customerId) {
    assertObjectId(customerId, 'customerId');
    match.customerId = new mongoose.Types.ObjectId(customerId);
  }
  if (productId) {
    assertObjectId(productId, 'productId');
    match.productId = new mongoose.Types.ObjectId(productId);
  }
  const rows = await SurplusStockItem.find(match).sort({ partName: 1 }).lean();
  const map = new Map();
  for (const r of rows) {
    const key = `${r.customerId}|${r.productId}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      partName: r.partName,
      moldName: r.moldName || '',
      cavity: r.cavity || 1,
      requiredQuantity: 0,
      quantityOnHand: r.quantityOnHand,
      finishedQuantity: 0,
      surplusQuantity: r.quantityOnHand,
      status: 'pending',
    });
  }
  return map;
}

// Optional { customerId } match stage shared by the tree aggregations.
function customerMatchStage(customerId) {
  if (!customerId) return [];
  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw badRequest('Invalid customerId', 'invalid_id');
  }
  return [{ $match: { customerId: new mongoose.Types.ObjectId(customerId) } }];
}

// Split a list of part rows into the three Component Store buckets.
function bucketParts(parts) {
  return {
    parts,
    pending: parts.filter((x) => x.status === 'pending'),
    finished: parts.filter((x) => x.status === 'finished'),
    surplus: parts.filter((x) => x.surplusQuantity > 0),
  };
}

// PRODUCT-LEVEL aggregate: Customer → Product → Part → quantity (summed across orders).
// Kept for the cross-order store view and the Customer Portal (which reads products[].
// parts / pending / finished). Each part row carries derived status + surplus.
async function getComponentStoreTree({ customerId } = {}) {
  const rows = await ComponentStockItem.aggregate([
    ...customerMatchStage(customerId),
    // Roll up across orders first: one row per (customer, product, part).
    {
      $group: {
        _id: { customerId: '$customerId', productId: '$productId', partName: '$partName' },
        moldName: { $first: '$moldName' },
        cavity: { $first: '$cavity' },
        requiredQuantity: { $sum: '$requiredQuantity' },
        quantityOnHand: { $sum: '$quantityOnHand' },
      },
    },
    { $lookup: { from: Product.collection.name, localField: '_id.productId', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: Customer.collection.name, localField: '_id.customerId', foreignField: '_id', as: 'customer' } },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    { $sort: { '_id.partName': 1 } },
    {
      $group: {
        _id: { customerId: '$_id.customerId', customerName: '$customer.name', productId: '$_id.productId', productName: '$product.name' },
        parts: {
          $push: {
            partName: '$_id.partName',
            moldName: '$moldName',
            cavity: '$cavity',
            requiredQuantity: '$requiredQuantity',
            quantityOnHand: '$quantityOnHand',
          },
        },
        productTotal: { $sum: '$quantityOnHand' },
      },
    },
    {
      $group: {
        _id: { customerId: '$_id.customerId', customerName: '$_id.customerName' },
        products: {
          $push: {
            productId: '$_id.productId',
            product: '$_id.productName',
            totalQuantity: '$productTotal',
            parts: '$parts',
          },
        },
        customerTotal: { $sum: '$productTotal' },
      },
    },
    { $sort: { '_id.customerName': 1 } },
  ]);

  return rows.map((c) => ({
    customerId: c._id.customerId ? c._id.customerId.toString() : null,
    customer: c._id.customerName || null,
    totalQuantity: c.customerTotal,
    products: (c.products || []).map((p) => {
      const parts = (p.parts || []).map(toPartRow);
      return {
        productId: p.productId ? p.productId.toString() : null,
        product: p.product || null,
        totalQuantity: p.totalQuantity,
        ...bucketParts(parts),
      };
    }),
  }));
}

// ORDER-SCOPED view: Customer → Product → Order → Parts with Pending/Finished/Surplus.
// Powers the revised Component Store screen and the Admin "Component Store Status".
// Optional filters: customerId, productId, orderId.
async function getComponentStoreByOrder({ customerId, productId, orderId } = {}) {
  const match = {};
  if (customerId) {
    assertObjectId(customerId, 'customerId');
    match.customerId = new mongoose.Types.ObjectId(customerId);
  }
  if (productId) {
    assertObjectId(productId, 'productId');
    match.productId = new mongoose.Types.ObjectId(productId);
  }
  if (orderId) {
    assertObjectId(orderId, 'orderId');
    match.orderId = new mongoose.Types.ObjectId(orderId);
  }

  // Surplus is product-level (NOT scoped to the selected order), so it is fetched with
  // only the customer/product filters and attached to each product node below.
  const surplusMap = await getSurplusByProduct({ customerId, productId });

  const rows = await ComponentStockItem.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $lookup: { from: Product.collection.name, localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: Customer.collection.name, localField: 'customerId', foreignField: '_id', as: 'customer' } },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: Order.collection.name, localField: 'orderId', foreignField: '_id', as: 'order' } },
    { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
    { $sort: { partName: 1 } },
    {
      $group: {
        _id: { customerId: '$customerId', customerName: '$customer.name', productId: '$productId', productName: '$product.name', orderId: '$orderId', orderCode: '$order.orderCode' },
        parts: {
          $push: {
            partName: '$partName',
            moldName: '$moldName',
            cavity: '$cavity',
            requiredQuantity: '$requiredQuantity',
            quantityOnHand: '$quantityOnHand',
          },
        },
        orderTotal: { $sum: '$quantityOnHand' },
      },
    },
    { $sort: { '_id.orderCode': 1 } },
    {
      $group: {
        _id: { customerId: '$_id.customerId', customerName: '$_id.customerName', productId: '$_id.productId', productName: '$_id.productName' },
        orders: {
          $push: {
            orderId: '$_id.orderId',
            orderCode: '$_id.orderCode',
            totalQuantity: '$orderTotal',
            parts: '$parts',
          },
        },
        productTotal: { $sum: '$orderTotal' },
      },
    },
    {
      $group: {
        _id: { customerId: '$_id.customerId', customerName: '$_id.customerName' },
        products: {
          $push: {
            productId: '$_id.productId',
            product: '$_id.productName',
            totalQuantity: '$productTotal',
            orders: '$orders',
          },
        },
        customerTotal: { $sum: '$productTotal' },
      },
    },
    { $sort: { '_id.customerName': 1 } },
  ]);

  return rows.map((c) => ({
    customerId: c._id.customerId ? c._id.customerId.toString() : null,
    customer: c._id.customerName || null,
    totalQuantity: c.customerTotal,
    products: (c.products || []).map((p) => {
      // Pending / Finished stay ORDER-scoped: each OrderID keeps its own buckets and
      // production never merges across orders. Surplus is PRODUCT-level and lives in its
      // own store (surplusstockitems), accumulated per part across every order
      // (FFT-00001 Big Block 500 + FFT-00002 Big Block 300 ⇒ store shows 800).
      const surplus = surplusMap.get(`${c._id.customerId}|${p.productId}`) || [];
      const orders = (p.orders || [])
        // ORDER COMPLETION: once assembly has consumed every component for an order its
        // cells all reach 0 (orderTotal === 0). Such orders drop out of the active store
        // view (records are kept; the order moves to its completed/history state).
        .filter((o) => o.totalQuantity > 0)
        .map((o) => {
          const parts = (o.parts || []).map(toPartRow);
          return {
            orderId: o.orderId ? o.orderId.toString() : null,
            orderCode: o.orderCode || null,
            totalQuantity: o.totalQuantity,
            parts,
            pending: parts.filter((x) => x.status === 'pending'),
            finished: parts.filter((x) => x.status === 'finished'),
          };
        });
      return {
        productId: p.productId ? p.productId.toString() : null,
        product: p.product || null,
        totalQuantity: p.totalQuantity,
        surplus,
        orders,
      };
    }),
  }));
}

// Customer → Product → quantity hierarchy for the Finished Goods Store view.
async function getFinishedGoodsStoreTree({ customerId } = {}) {
  const rows = await FinishedGoodsItem.aggregate([
    ...customerMatchStage(customerId),
    { $lookup: { from: Product.collection.name, localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: Customer.collection.name, localField: 'customerId', foreignField: '_id', as: 'customer' } },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    { $sort: { 'product.name': 1 } },
    {
      $group: {
        _id: { customerId: '$customerId', customerName: '$customer.name' },
        products: {
          $push: { productId: '$productId', product: '$product.name', quantityOnHand: '$quantityOnHand' },
        },
        customerTotal: { $sum: '$quantityOnHand' },
      },
    },
    { $sort: { '_id.customerName': 1 } },
  ]);

  return rows.map((c) => ({
    customerId: c._id.customerId ? c._id.customerId.toString() : null,
    customer: c._id.customerName || null,
    totalQuantity: c.customerTotal,
    products: (c.products || []).map((p) => ({
      productId: p.productId ? p.productId.toString() : null,
      product: p.product || null,
      quantityOnHand: p.quantityOnHand,
    })),
  }));
}

// Paginated ledger history with optional filters (admin audit view).
async function listLedger(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.storeType) {
    if (!STORE[query.storeType]) throw badRequest('Invalid storeType', 'invalid_store_type');
    filter.storeType = query.storeType;
  }
  if (query.transactionType) {
    if (!TXN[query.transactionType]) throw badRequest('Invalid transactionType', 'invalid_txn_type');
    filter.transactionType = query.transactionType;
  }
  for (const key of ['customerId', 'productId', 'orderId']) {
    if (query[key]) {
      assertObjectId(query[key], key);
      filter[key] = query[key];
    }
  }
  if (query.sourceModule) filter.sourceModule = query.sourceModule;

  const [items, total] = await Promise.all([
    StockLedgerEntry.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    StockLedgerEntry.countDocuments(filter),
  ]);

  const data = items.map((e) => ({
    id: e._id.toString(),
    storeType: e.storeType,
    transactionType: e.transactionType,
    customerId: e.customerId.toString(),
    productId: e.productId.toString(),
    orderId: e.orderId ? e.orderId.toString() : null,
    partName: e.partName || null,
    quantity: e.quantity,
    sourceModule: e.sourceModule,
    referenceId: e.referenceId ? e.referenceId.toString() : null,
    remarks: e.remarks || null,
    createdBy: e.createdBy.toString(),
    createdAt: e.createdAt,
  }));

  return buildList(data, total, page, limit);
}

// Self-heal the Component Store indexes at startup so a deployment never silently
// depends on the one-off migration having been run. The legacy PRODUCT-level unique
// index (customerId_1_productId_1_partName_1) blocks a second order for the same
// customer+product+part from creating its own cell — the exact "new order doesn't
// update the store" bug. Drop it if present, then bring both balance collections in
// line with their current schema indexes. Failures only log (never crash startup).
async function ensureStoreIndexes() {
  try {
    const indexes = await ComponentStockItem.collection.indexes();
    const stale = indexes.find((ix) => ix.name === 'customerId_1_productId_1_partName_1');
    if (stale) {
      await ComponentStockItem.collection.dropIndex(stale.name);
      console.log('[store] dropped stale component index', stale.name);
    }
  } catch (err) {
    console.warn('[store] stale-index check skipped:', err.message);
  }
  try {
    await ComponentStockItem.syncIndexes();
    await SurplusStockItem.syncIndexes();
    // Outsourced Components store (separate from moulded inventory).
    await require('../models/OutsourcedComponentItem').syncIndexes();
    await require('../models/OutsourcedSurplusItem').syncIndexes();
  } catch (err) {
    console.warn('[store] syncIndexes warning:', err.message);
  }
}

module.exports = {
  STORE,
  TXN,
  applyStockIn,
  applyStockOut,
  getComponentAvailability,
  getFinishedGoodsBalance,
  getSurplusByProduct,
  transferOrderComponentsToSurplus,
  consumeSurplus,
  getComponentStoreTree,
  getComponentStoreByOrder,
  getFinishedGoodsStoreTree,
  listLedger,
  ensureStoreIndexes,
};
