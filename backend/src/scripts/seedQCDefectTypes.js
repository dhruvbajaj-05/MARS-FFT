'use strict';

// Seed the default QC defect palette (Flash, Half Shot, Ejector Pin Mark, …).
// Idempotent — existing names are skipped (case-insensitive). The service also
// lazy-seeds on first read, so this script is optional but handy for provisioning.
// Run with:  npm run seed:qc-defects

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const QCDefectType = require('../models/QCDefectType');

async function seed() {
  await connectDB();

  let created = 0;
  for (const name of QCDefectType.DEFAULTS) {
    const res = await QCDefectType.updateOne(
      { name },
      { $setOnInsert: { name, createdBy: null } },
      { upsert: true, collation: { locale: 'en', strength: 2 } }
    );
    if (res.upsertedCount) created += 1;
  }

  console.log(`[seed] QC defect types ready (${created} new, ${QCDefectType.DEFAULTS.length} total defaults).`);
  await mongoose.connection.close();
}

seed().catch(async (err) => {
  console.error('[seed] Failed:', err.message);
  try {
    await mongoose.connection.close();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
