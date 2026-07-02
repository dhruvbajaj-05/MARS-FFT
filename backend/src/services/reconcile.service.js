'use strict';

const mongoose = require('mongoose');
const Order = require('../models/Order');
const OrderMold = require('../models/OrderMold');
const MouldingRecord = require('../models/MouldingRecord');
const AssemblyRecord = require('../models/AssemblyRecord');
const ComponentStockItem = require('../models/ComponentStockItem');
const SurplusStockItem = require('../models/SurplusStockItem');
const OutsourcedComponentItem = require('../models/OutsourcedComponentItem');
const OutsourcedSurplusItem = require('../models/OutsourcedSurplusItem');
const OutsourcedReceipt = require('../models/OutsourcedReceipt');
const StockLedgerEntry = require('../models/StockLedgerEntry');

// ---------------------------------------------------------------------------
// Reconciliation engine — the SINGLE writer of every inventory balance cache.
//
// Balances (component / surplus / outsourced) are never $inc-nudged by department code.
// Instead, after any create / edit / delete of a source record (moulding, assembly,
// outsourced receipt, order/BOM), the owning service calls reconcileProduct /
// reconcileOutsourced, which recomputes the WHOLE product's balances from scratch from the
// immutable source records and overwrites the cache. This makes drift impossible: the store
// is always mathematically consistent with the complete transaction history, and any edit
// or deletion automatically produces the correct new state.
//
// Shared allocation rule (used by both moulded and outsourced):
//   • Each order fills its own requirement first from its own production/receipts.
//   • Overage beyond an order's requirement rolls into a PRODUCT-LEVEL surplus pool.
//   • Orders draw from that pool to cover any remaining requirement, OLDEST-FIRST (FIFO).
//   • Whatever is left in the pool is the product surplus on hand.
//   • Consuming (assembly) reduces on-hand; reducing production shrinks surplus before
//     finished, and grows pending only once surplus is exhausted — all of this falls out
//     of recomputing from produced-vs-required rather than mutating stored buckets.
// ---------------------------------------------------------------------------

// Run `fn(session)` inside a MongoDB transaction when the deployment supports it (Atlas /
// any replica set). On a standalone dev server transactions are unavailable — detect that
// and fall back to a session-less run. Reconcile writes are absolute ($set) and idempotent,
// so a fallback re-run is always safe.
async function withOptionalTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    const msg = String(err && err.message);
    const unsupported =
      err && (err.code === 20 || err.codeName === 'IllegalOperation') &&
      /Transaction|replica set|not supported/i.test(msg);
    if (unsupported || /Transaction numbers are only allowed on a replica set/i.test(msg)) {
      return fn(null);
    }
    throw err;
  } finally {
    session.endSession();
  }
}

const oid = (v) => new mongoose.Types.ObjectId(String(v));

// Sort key helper — FIFO by creation, stable tiebreak on _id.
function fifo(a, b) {
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  if (ta !== tb) return ta - tb;
  return String(a._id).localeCompare(String(b._id));
}

// Core allocation for one item type (a "line" = order+key). Given, per order (already in
// FIFO order), its requirement, its own supply (produced/received), the amount consumed
// from the order bucket, whether the order's assembly is complete, and a starting surplus
// pool (recovered pieces − extra-set consumption), compute each order's on-hand + pending/
// procurement plus the leftover product surplus.
function allocateFifo(lines, startingPool) {
  let pool = startingPool;
  const out = [];
  for (const l of lines) {
    const required = Math.max(0, l.required);
    const supply = Math.max(0, l.supply);
    const consumed = Math.max(0, l.consumed);

    const ownFill = Math.min(supply, required);
    const need = required - ownFill;
    const draw = Math.min(Math.max(0, need), Math.max(0, pool));
    pool -= draw;
    const filled = ownFill + draw;          // requirement met (own + surplus)
    const overage = supply - ownFill;       // beyond own requirement → surplus
    pool += overage;

    let onHand = Math.max(0, filled - consumed);
    const shortfall = Math.max(0, required - filled); // pending (moulded) / to-purchase (outsourced)

    // A completed order releases its remaining on-hand back into the product surplus pool so
    // future orders / extra sets can use it; its own cell drops to zero (leaves active view).
    if (l.completed) {
      pool += onHand;
      onHand = 0;
    }

    out.push({ ...l, required, onHand, shortfall });
  }
  return { lines: out, surplus: Math.max(0, pool) };
}

// ---- Shared source loaders -------------------------------------------------

async function loadOrders(customerId, productId, session) {
  const orders = await Order.find({ customerId, productId }, null, { session }).lean();
  orders.sort(fifo);
  return orders;
}

// ===========================================================================
// MOULDED reconciliation
// ===========================================================================

async function reconcileProduct(customerId, productId, existingSession) {
  const run = async (session) => {
    const cust = oid(customerId);
    const prod = oid(productId);

    const [orders, orderMolds, producedAgg, recoveredAgg, assemblyRecs] = await Promise.all([
      loadOrders(cust, prod, session),
      OrderMold.find({ productId: prod, customerId: cust }, null, { session }).lean(),
      MouldingRecord.aggregate([
        { $match: { customerId: cust, productId: prod } },
        {
          $group: {
            _id: { orderId: '$orderId', partName: '$partName' },
            produced: { $sum: '$goodParts' },
            moldName: { $first: '$moldName' },
            cavity: { $first: '$cavity' },
          },
        },
      ]).session(session),
      StockLedgerEntry.aggregate([
        {
          $match: {
            customerId: cust, productId: prod,
            storeType: 'SURPLUS', transactionType: 'IN', sourceModule: 'moulding_recovery',
          },
        },
        { $group: { _id: '$partName', qty: { $sum: '$quantity' } } },
      ]).session(session),
      AssemblyRecord.find({ customerId: cust, productId: prod }, null, { session }).lean(),
    ]);

    // required(order|part) + mold identity from OrderMold (authoritative target).
    const required = new Map();  // key `${orderId}|${part}` → number
    const meta = new Map();      // key `${orderId}|${part}` → { moldName, cavity }
    const partsByOrder = new Map(); // orderId → Set(part)
    const allParts = new Set();
    const addPart = (orderId, part) => {
      if (!partsByOrder.has(orderId)) partsByOrder.set(orderId, new Set());
      partsByOrder.get(orderId).add(part);
      allParts.add(part);
    };
    for (const m of orderMolds) {
      const key = `${m.orderId}|${m.partName}`;
      required.set(key, (required.get(key) || 0) + (m.requiredShots || 0) * (m.cavity || 1));
      meta.set(key, { moldName: m.moldName || '', cavity: m.cavity || 1 });
      addPart(String(m.orderId), m.partName);
    }

    // produced(order|part).
    const produced = new Map();
    for (const p of producedAgg) {
      const key = `${p._id.orderId}|${p._id.partName}`;
      produced.set(key, p.produced || 0);
      if (!meta.has(key)) meta.set(key, { moldName: p.moldName || '', cavity: p.cavity || 1 });
      addPart(String(p._id.orderId), p._id.partName);
    }

    // recovered(part) — product-level surplus additions from inspected rejects.
    const recovered = new Map();
    for (const r of recoveredAgg) { recovered.set(r._id, r.qty || 0); allParts.add(r._id); }

    // consumption: normal (order bucket) + extra (product surplus), moulded parts only.
    const normalConsumed = new Map(); // `${orderId}|${part}` → number
    const extraConsumed = new Map();  // part → number
    for (const rec of assemblyRecs) {
      for (const c of rec.consumption || []) {
        if ((c.kind || 'moulded') !== 'moulded') continue;
        const per = c.perSet || 0;
        if (rec.orderId && rec.assembledSets) {
          const key = `${rec.orderId}|${c.partName}`;
          normalConsumed.set(key, (normalConsumed.get(key) || 0) + per * rec.assembledSets);
          addPart(String(rec.orderId), c.partName);
        }
        if (rec.extraSets) {
          extraConsumed.set(c.partName, (extraConsumed.get(c.partName) || 0) + per * rec.extraSets);
          allParts.add(c.partName);
        }
      }
    }

    // Per part: build FIFO order lines, allocate, collect cell targets + surplus.
    const cellTargets = []; // { orderId, partName, moldName, cavity, requiredQuantity, quantityOnHand }
    const surplusTargets = []; // { partName, moldName, cavity, quantityOnHand }
    for (const part of allParts) {
      const startingPool = (recovered.get(part) || 0) - (extraConsumed.get(part) || 0);
      const lines = orders
        .filter((o) => (partsByOrder.get(String(o._id)) || new Set()).has(part))
        .map((o) => {
          const key = `${o._id}|${part}`;
          return {
            orderId: String(o._id),
            required: required.get(key) || 0,
            supply: produced.get(key) || 0,
            consumed: normalConsumed.get(key) || 0,
            completed: o.assemblyStatus === 'Completed' || o.status === 'Archived',
            m: meta.get(key) || { moldName: '', cavity: 1 },
          };
        });

      const result = allocateFifo(lines, startingPool);
      for (const l of result.lines) {
        cellTargets.push({
          orderId: l.orderId,
          partName: part,
          moldName: l.m.moldName,
          cavity: l.m.cavity,
          requiredQuantity: l.required,
          quantityOnHand: l.onHand,
        });
      }
      // Mold identity for the surplus row (first order that knows this part).
      const anyMeta = result.lines.find((l) => l.m && l.m.cavity)?.m || { moldName: '', cavity: 1 };
      surplusTargets.push({
        partName: part,
        moldName: anyMeta.moldName || '',
        cavity: anyMeta.cavity || 1,
        quantityOnHand: result.surplus,
      });
    }

    // ---- Write phase: reset the product's caches, then set absolute values ----
    await ComponentStockItem.updateMany(
      { customerId: cust, productId: prod },
      { $set: { quantityOnHand: 0 } },
      { session }
    );
    await SurplusStockItem.updateMany(
      { customerId: cust, productId: prod },
      { $set: { quantityOnHand: 0 } },
      { session }
    );

    if (cellTargets.length) {
      await ComponentStockItem.bulkWrite(
        cellTargets.map((t) => ({
          updateOne: {
            filter: { customerId: cust, productId: prod, orderId: oid(t.orderId), partName: t.partName },
            update: {
              $set: {
                moldName: t.moldName || '',
                cavity: t.cavity || 1,
                requiredQuantity: t.requiredQuantity,
                quantityOnHand: t.quantityOnHand,
              },
            },
            upsert: true,
          },
        })),
        { session, ordered: false }
      );
    }
    if (surplusTargets.length) {
      await SurplusStockItem.bulkWrite(
        surplusTargets.map((t) => ({
          updateOne: {
            filter: { customerId: cust, productId: prod, partName: t.partName },
            update: { $set: { moldName: t.moldName || '', cavity: t.cavity || 1, quantityOnHand: t.quantityOnHand } },
            upsert: true,
          },
        })),
        { session, ordered: false }
      );
    }

    return { cells: cellTargets.length, surplusParts: surplusTargets.length };
  };

  return existingSession ? run(existingSession) : withOptionalTransaction(run);
}

// ===========================================================================
// OUTSOURCED reconciliation
// ===========================================================================

async function reconcileOutsourced(customerId, productId, existingSession) {
  const run = async (session) => {
    const cust = oid(customerId);
    const prod = oid(productId);

    const [orders, snapshots, receiptsAgg, assemblyRecs] = await Promise.all([
      loadOrders(cust, prod, session),
      OutsourcedComponentItem.find({ customerId: cust, productId: prod }, null, { session }).lean(),
      OutsourcedReceipt.aggregate([
        { $match: { customerId: cust, productId: prod } },
        { $group: { _id: { orderId: '$orderId', componentName: '$componentName' }, received: { $sum: '$quantityReceived' } } },
      ]).session(session),
      AssemblyRecord.find({ customerId: cust, productId: prod }, null, { session }).lean(),
    ]);

    const orderById = new Map(orders.map((o) => [String(o._id), o]));

    // perSet snapshot per (order, component) — the frozen per-order BOM target.
    const perSet = new Map();          // `${orderId}|${comp}` → perSet
    const compsByOrder = new Map();    // orderId → Set(comp)
    const allComps = new Set();
    const addComp = (orderId, comp) => {
      if (!compsByOrder.has(orderId)) compsByOrder.set(orderId, new Set());
      compsByOrder.get(orderId).add(comp);
      allComps.add(comp);
    };
    for (const s of snapshots) {
      const key = `${s.orderId}|${s.componentName}`;
      perSet.set(key, s.perSet || 0);
      addComp(String(s.orderId), s.componentName);
    }

    // received(order|comp).
    const received = new Map();
    for (const r of receiptsAgg) {
      const key = `${r._id.orderId}|${r._id.componentName}`;
      received.set(key, r.received || 0);
      addComp(String(r._id.orderId), r._id.componentName);
    }

    // consumption (outsourced kind): normal (order) + extra (surplus).
    const normalConsumed = new Map();
    const extraConsumed = new Map();
    for (const rec of assemblyRecs) {
      for (const c of rec.consumption || []) {
        if (c.kind !== 'outsourced') continue;
        const per = c.perSet || 0;
        if (rec.orderId && rec.assembledSets) {
          const key = `${rec.orderId}|${c.partName}`;
          normalConsumed.set(key, (normalConsumed.get(key) || 0) + per * rec.assembledSets);
          addComp(String(rec.orderId), c.partName);
        }
        if (rec.extraSets) {
          extraConsumed.set(c.partName, (extraConsumed.get(c.partName) || 0) + per * rec.extraSets);
          allComps.add(c.partName);
        }
      }
    }

    const cellTargets = [];    // { orderId, componentName, perSet, requiredQuantity, quantityOnHand, procurementNeed }
    const surplusTargets = []; // { componentName, quantityOnHand }
    for (const comp of allComps) {
      const startingPool = -(extraConsumed.get(comp) || 0); // no "recovery" concept for outsourced
      const lines = orders
        .filter((o) => (compsByOrder.get(String(o._id)) || new Set()).has(comp))
        .map((o) => {
          const key = `${o._id}|${comp}`;
          const per = perSet.get(key) || 0;
          return {
            orderId: String(o._id),
            perSet: per,
            required: (o.orderQuantity || 0) * per,
            supply: received.get(key) || 0,
            consumed: normalConsumed.get(key) || 0,
            completed: o.assemblyStatus === 'Completed' || o.status === 'Archived',
          };
        });

      const result = allocateFifo(lines, startingPool);
      for (const l of result.lines) {
        cellTargets.push({
          orderId: l.orderId,
          componentName: comp,
          perSet: l.perSet,
          requiredQuantity: l.required,
          quantityOnHand: l.onHand,
          procurementNeed: l.shortfall,
        });
      }
      surplusTargets.push({ componentName: comp, quantityOnHand: result.surplus });
    }

    // Reset then set absolute values. Note: outsourced order cells are ALSO the BOM
    // snapshot, so we never delete them — we only reset their derived fields.
    await OutsourcedComponentItem.updateMany(
      { customerId: cust, productId: prod },
      { $set: { quantityOnHand: 0, procurementNeed: 0 } },
      { session }
    );
    await OutsourcedSurplusItem.updateMany(
      { customerId: cust, productId: prod },
      { $set: { quantityOnHand: 0 } },
      { session }
    );

    if (cellTargets.length) {
      await OutsourcedComponentItem.bulkWrite(
        cellTargets
          .filter((t) => orderById.has(t.orderId))
          .map((t) => ({
            updateOne: {
              filter: { customerId: cust, productId: prod, orderId: oid(t.orderId), componentName: t.componentName },
              update: {
                $set: {
                  perSet: t.perSet,
                  requiredQuantity: t.requiredQuantity,
                  quantityOnHand: t.quantityOnHand,
                  procurementNeed: t.procurementNeed,
                },
              },
              upsert: true,
            },
          })),
        { session, ordered: false }
      );
    }
    if (surplusTargets.length) {
      await OutsourcedSurplusItem.bulkWrite(
        surplusTargets.map((t) => ({
          updateOne: {
            filter: { customerId: cust, productId: prod, componentName: t.componentName },
            update: { $set: { quantityOnHand: t.quantityOnHand } },
            upsert: true,
          },
        })),
        { session, ordered: false }
      );
    }

    return { cells: cellTargets.length, surplusComps: surplusTargets.length };
  };

  return existingSession ? run(existingSession) : withOptionalTransaction(run);
}

// Convenience: reconcile both stores for a product (most callers touch both).
async function reconcileAllForProduct(customerId, productId) {
  await reconcileProduct(customerId, productId);
  await reconcileOutsourced(customerId, productId);
}

module.exports = {
  reconcileProduct,
  reconcileOutsourced,
  reconcileAllForProduct,
  allocateFifo, // exported for unit-style verification
};
