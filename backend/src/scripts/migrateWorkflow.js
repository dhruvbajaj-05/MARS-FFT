'use strict';

// One-off migration to the revised, order-centric workflow.
// Run with:  npm run migrate:workflow
//
// NON-DESTRUCTIVE to production records — Moulding/Assembly/QC/Dispatch records are the
// source of truth and are never modified or deleted here. Component Store balances are
// a materialized rollup, so they are safely rebuilt from those immutable records.
//
// Steps:
//   1. Backfill Order lifecycle defaults (status / productionStatus / assemblyStatus).
//   2. Assign sequential OrderID codes (FFT-#####) to any order missing one, and align
//      the Counter sequence so future creates continue from there.
//   3. Seed per-order Mould Setup (OrderMold) from existing moulding records, taking
//      Required Shots from the product-level MoldDefinition when known.
//   4. Drop the stale product-level ComponentStockItem unique index.
//   5. Rebuild ComponentStockItem balances + COMPONENT ledger entries PER ORDER from
//      moulding (IN) and assembly consumption (OUT).

const mongoose = require('mongoose');
const connectDB = require('../config/db');

const Order = require('../models/Order');
const Counter = require('../models/Counter');
const OrderMold = require('../models/OrderMold');
const MoldDefinition = require('../models/MoldDefinition');
const MouldingRecord = require('../models/MouldingRecord');
const AssemblyRecord = require('../models/AssemblyRecord');
const ComponentStockItem = require('../models/ComponentStockItem');
const SurplusStockItem = require('../models/SurplusStockItem');
const StockLedgerEntry = require('../models/StockLedgerEntry');
const orderService = require('../services/order.service');

const log = (...args) => console.log('[migrate]', ...args);

// ---- Step 1: lifecycle defaults --------------------------------------------
async function backfillLifecycle() {
  const res = await Order.updateMany(
    { $or: [{ status: { $exists: false } }, { status: null }] },
    { $set: { status: 'Active', productionStatus: 'Active', assemblyStatus: 'Active' } }
  );
  log(`lifecycle defaults backfilled on ${res.modifiedCount} order(s)`);
}

// ---- Step 2: assign FFT-##### codes ----------------------------------------
async function assignOrderCodes() {
  const missing = await Order.find({ $or: [{ orderCode: { $exists: false } }, { orderCode: null }] })
    .sort({ createdAt: 1 })
    .select('_id');
  for (const o of missing) {
    const code = await orderService.nextOrderCode();
    await Order.updateOne({ _id: o._id }, { $set: { orderCode: code } });
  }
  log(`assigned OrderID codes to ${missing.length} order(s)`);

  // Make sure the Counter is at least at the highest existing numeric code, so future
  // creates never collide with a manually/previously assigned code.
  const all = await Order.find({ orderCode: { $ne: null } }).select('orderCode').lean();
  let max = 0;
  for (const o of all) {
    const m = /^FFT-(\d+)$/.exec(o.orderCode || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const counter = await Counter.findById('orderCode');
  if (!counter || counter.seq < max) {
    await Counter.findByIdAndUpdate('orderCode', { $set: { seq: max } }, { upsert: true });
    log(`counter 'orderCode' aligned to ${max}`);
  }
}

// ---- Step 3: seed per-order Mould Setup ------------------------------------
async function seedOrderMolds() {
  // Required Shots memory per (product, mold) from the learned definitions.
  const defs = await MoldDefinition.find().lean();
  const defByKey = new Map(defs.map((d) => [`${d.productId}|${d.moldName}`, d]));

  // Distinct (order, mold) pairs ever produced, with representative cavity/part.
  const pairs = await MouldingRecord.aggregate([
    {
      $group: {
        _id: { orderId: '$orderId', moldName: '$moldName' },
        customerId: { $first: '$customerId' },
        productId: { $first: '$productId' },
        partName: { $first: '$partName' },
        cavity: { $first: '$cavity' },
        createdBy: { $first: '$createdBy' },
      },
    },
  ]);

  let created = 0;
  for (const p of pairs) {
    const exists = await OrderMold.findOne({ orderId: p._id.orderId, moldName: p._id.moldName });
    if (exists) continue;
    const def = defByKey.get(`${p.productId}|${p._id.moldName}`);
    const cavity = (def && def.cavity) || p.cavity || 1;
    const requiredShots = (def && def.requiredShots) || 0;
    try {
      await OrderMold.create({
        orderId: p._id.orderId,
        customerId: p.customerId,
        productId: p.productId,
        moldName: p._id.moldName,
        partName: p.partName,
        cavity,
        requiredShots,
        createdBy: p.createdBy,
      });
      created += 1;
    } catch (err) {
      if (!(err && err.code === 11000)) throw err; // ignore races/dupes
    }
  }
  log(`seeded ${created} order-mold setup row(s)`);
}

// ---- Step 4: drop stale component index ------------------------------------
async function dropStaleComponentIndex() {
  const indexes = await ComponentStockItem.collection.indexes();
  const stale = indexes.find(
    (ix) => ix.name === 'customerId_1_productId_1_partName_1'
  );
  if (stale) {
    await ComponentStockItem.collection.dropIndex(stale.name);
    log(`dropped stale component index ${stale.name}`);
  } else {
    log('no stale component index to drop');
  }
}

// ---- Step 5: rebuild per-order component balances + ledger -----------------
async function rebuildComponentStore() {
  // Order-mold lookup for Required Quantity targets.
  const oms = await OrderMold.find().lean();
  const omByKey = new Map(oms.map((m) => [`${m.orderId}|${m.moldName}`, m]));

  // bucket key = customer|product|order|part. Track produced (moulding good parts) and
  // consumed (assembly) separately so we can split over-production into the surplus store
  // exactly the way the live stock-IN path does.
  const buckets = new Map();
  const ensure = (customerId, productId, orderId, partName) => {
    const key = `${customerId}|${productId}|${orderId}|${partName}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        customerId, productId, orderId, partName,
        moldName: '', cavity: 1, produced: 0, consumed: 0,
        moldNames: new Set(), producedBy: null, consumedBy: null,
      };
      buckets.set(key, b);
    }
    return b;
  };

  // Moulding IN — only good parts flow into the store.
  const mouldings = await MouldingRecord.find().sort({ createdAt: 1 }).lean();
  for (const r of mouldings) {
    if (!r.orderId) continue; // every moulding record has an order in practice
    const b = ensure(r.customerId, r.productId, r.orderId, r.partName);
    b.moldName = r.moldName || b.moldName;
    b.cavity = r.cavity || b.cavity;
    if (r.moldName) b.moldNames.add(r.moldName);
    b.produced += r.goodParts || 0;
    if (!b.producedBy) b.producedBy = r.createdBy;
  }

  // Assembly OUT — consumption per part for records that carry an order.
  const assemblies = await AssemblyRecord.find().sort({ createdAt: 1 }).lean();
  let orphanConsumption = 0;
  for (const a of assemblies) {
    if (!a.orderId || !Array.isArray(a.consumption)) {
      if (Array.isArray(a.consumption) && a.consumption.length) orphanConsumption += 1;
      continue;
    }
    for (const c of a.consumption) {
      const b = ensure(a.customerId, a.productId, a.orderId, c.partName);
      b.consumed += c.quantity || 0;
      if (!b.consumedBy) b.consumedBy = a.submittedBy;
    }
  }
  if (orphanConsumption > 0) {
    log(`WARNING: ${orphanConsumption} assembly record(s) had consumption but no orderId — skipped (cannot attribute to an order in the new model)`);
  }

  // Split each bucket the same way live stock-IN does:
  //   required        = Σ over feeding molds of (requiredShots × cavity)
  //   toSurplus       = max(0, produced − required)   → product-level surplus store
  //   cellOnHand      = max(0, min(produced, required) − consumed)  → order cell
  // Surplus accumulates per (customer, product, part) across all orders.
  const docs = [];
  const inLedger = [];
  const outLedger = [];
  const surplusLedger = [];
  const surplusByPart = new Map(); // key c|p|part → { customerId, productId, partName, moldName, cavity, qty }

  for (const b of buckets.values()) {
    let requiredQuantity = 0;
    for (const mn of b.moldNames) {
      const om = omByKey.get(`${b.orderId}|${mn}`);
      if (om) requiredQuantity += (om.requiredShots || 0) * (om.cavity || 0);
    }

    const toSurplus = requiredQuantity > 0 ? Math.max(0, b.produced - requiredQuantity) : 0;
    const toCellProduced = b.produced - toSurplus; // production that stayed in the order cell
    const cellOnHand = Math.max(0, toCellProduced - b.consumed);

    docs.push({
      customerId: b.customerId,
      productId: b.productId,
      orderId: b.orderId,
      moldName: b.moldName || '',
      partName: b.partName,
      cavity: b.cavity || 1,
      requiredQuantity,
      quantityOnHand: cellOnHand,
    });

    // Ledger: component IN for what stayed in the cell, surplus IN for the overage,
    // assembly OUT for what was consumed. createdBy is the representative author captured
    // while scanning the source records.
    if (toCellProduced > 0 && b.producedBy) {
      inLedger.push({
        storeType: 'COMPONENT', transactionType: 'IN',
        customerId: b.customerId, productId: b.productId, orderId: b.orderId,
        partName: b.partName, quantity: toCellProduced, sourceModule: 'moulding',
        remarks: `Rebuild: moulding ${b.moldName} / ${b.partName}`,
        createdBy: b.producedBy,
      });
    }
    if (b.consumed > 0 && b.consumedBy) {
      outLedger.push({
        storeType: 'COMPONENT', transactionType: 'OUT',
        customerId: b.customerId, productId: b.productId, orderId: b.orderId,
        partName: b.partName, quantity: b.consumed, sourceModule: 'assembly',
        remarks: `Rebuild: assembly consumed ${b.consumed} ${b.partName}`,
        createdBy: b.consumedBy,
      });
    }
    if (toSurplus > 0) {
      const key = `${b.customerId}|${b.productId}|${b.partName}`;
      const acc = surplusByPart.get(key) || {
        customerId: b.customerId, productId: b.productId, partName: b.partName,
        moldName: b.moldName || '', cavity: b.cavity || 1, qty: 0,
      };
      acc.qty += toSurplus;
      surplusByPart.set(key, acc);
      if (b.producedBy) {
        surplusLedger.push({
          storeType: 'SURPLUS', transactionType: 'IN',
          customerId: b.customerId, productId: b.productId, orderId: b.orderId,
          partName: b.partName, quantity: toSurplus, sourceModule: 'moulding',
          remarks: `Rebuild: surplus overage ${b.partName}`,
          createdBy: b.producedBy,
        });
      }
    }
  }

  const surplusDocs = Array.from(surplusByPart.values()).map((s) => ({
    customerId: s.customerId, productId: s.productId, partName: s.partName,
    moldName: s.moldName, cavity: s.cavity, quantityOnHand: s.qty,
  }));

  // Replace the materialized stores + their ledger entries (rebuild is the point).
  await ComponentStockItem.deleteMany({});
  await SurplusStockItem.deleteMany({});
  await StockLedgerEntry.deleteMany({ storeType: { $in: ['COMPONENT', 'SURPLUS'] } });
  if (docs.length) await ComponentStockItem.insertMany(docs);
  if (surplusDocs.length) await SurplusStockItem.insertMany(surplusDocs);
  const ledger = inLedger.concat(outLedger, surplusLedger);
  if (ledger.length) await StockLedgerEntry.insertMany(ledger);

  const totalOnHand = docs.reduce((s, d) => s + d.quantityOnHand, 0);
  const totalSurplus = surplusDocs.reduce((s, d) => s + d.quantityOnHand, 0);
  log(`rebuilt ${docs.length} component cell(s) across orders; total on hand = ${totalOnHand}`);
  log(`rebuilt ${surplusDocs.length} surplus cell(s); total surplus = ${totalSurplus}`);
  log(`wrote ${ledger.length} ledger entr(ies) (${inLedger.length} IN, ${outLedger.length} OUT, ${surplusLedger.length} SURPLUS)`);
}

async function run() {
  await connectDB();
  log('starting revised-workflow migration…');
  await backfillLifecycle();
  await assignOrderCodes();
  await seedOrderMolds();
  await dropStaleComponentIndex();
  await rebuildComponentStore();
  // Ensure the new indexes exist.
  await ComponentStockItem.syncIndexes();
  await SurplusStockItem.syncIndexes();
  await Order.syncIndexes();
  log('migration complete.');
  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('[migrate] FAILED:', err);
  try {
    await mongoose.connection.close();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
