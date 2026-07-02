'use strict';

// One-off repair + re-derivation of every inventory balance from the transaction history.
// Run with:  node src/scripts/reconcileAll.js   (or add an npm script)
//
// SAFE / NON-DESTRUCTIVE to source records — MouldingRecord / OrderMold / AssemblyRecord /
// OutsourcedReceipt are the source of truth and are never modified. This script only rebuilds
// the DERIVED caches (ComponentStockItem, SurplusStockItem, OutsourcedComponentItem,
// OutsourcedSurplusItem) via reconcile.service, so any historical drift is corrected.
//
// For every (customer, product) with any history, run reconcileProduct + reconcileOutsourced.

const mongoose = require('mongoose');
const connectDB = require('../config/db');

const Order = require('../models/Order');
const MouldingRecord = require('../models/MouldingRecord');
const ComponentStockItem = require('../models/ComponentStockItem');
const OutsourcedComponentItem = require('../models/OutsourcedComponentItem');
const OutsourcedReceipt = require('../models/OutsourcedReceipt');
const reconcileService = require('../services/reconcile.service');

const log = (...args) => console.log('[reconcileAll]', ...args);

// Collect the distinct (customerId, productId) pairs that have any inventory history.
async function collectProductPairs() {
  const seen = new Set();
  const pairs = [];
  const add = (c, p) => {
    if (!c || !p) return;
    const key = `${c}|${p}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ customerId: String(c), productId: String(p) });
  };

  const sources = [
    Order.aggregate([{ $group: { _id: { c: '$customerId', p: '$productId' } } }]),
    MouldingRecord.aggregate([{ $group: { _id: { c: '$customerId', p: '$productId' } } }]),
    ComponentStockItem.aggregate([{ $group: { _id: { c: '$customerId', p: '$productId' } } }]),
    OutsourcedComponentItem.aggregate([{ $group: { _id: { c: '$customerId', p: '$productId' } } }]),
    OutsourcedReceipt.aggregate([{ $group: { _id: { c: '$customerId', p: '$productId' } } }]),
  ];
  const results = await Promise.all(sources);
  for (const rows of results) for (const r of rows) add(r._id.c, r._id.p);
  return pairs;
}

async function run() {
  await connectDB();
  log('starting full reconciliation…');

  const pairs = await collectProductPairs();
  log(`reconciling ${pairs.length} (customer, product) pair(s)…`);

  let ok = 0;
  let failed = 0;
  for (const { customerId, productId } of pairs) {
    try {
      await reconcileService.reconcileProduct(customerId, productId);
      await reconcileService.reconcileOutsourced(customerId, productId);
      ok += 1;
    } catch (err) {
      failed += 1;
      log(`  FAILED ${customerId}/${productId}: ${err.message}`);
    }
  }
  log(`done — ${ok} reconciled, ${failed} failed.`);

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('[reconcileAll] FAILED:', err);
  try {
    await mongoose.connection.close();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
