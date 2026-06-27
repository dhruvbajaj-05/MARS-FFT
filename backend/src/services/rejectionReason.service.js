'use strict';

const RejectionReason = require('../models/RejectionReason');

const DEFAULTS = [
  'Flash',
  'Half Short',
  'Ejector Pin Mark',
  'Pin Oil Mark',
  'Black Spot / Contamination',
  'Shrinkage',
  'Warpage',
  'Burn Mark',
  'Silver Mark',
  'Color Variation',
];

// List remembered reasons (seeding the updated defaults on first use or when count < defaults).
// Returns plain strings sorted alphabetically.
async function listReasons() {
  const count = await RejectionReason.estimatedDocumentCount();
  if (count === 0) {
    await RejectionReason.insertMany(DEFAULTS.map((reason) => ({ reason })), { ordered: false }).catch(() => {});
  }
  const docs = await RejectionReason.find().sort({ reason: 1 }).lean();
  return { reasons: docs.map((d) => d.reason) };
}

// Remember one or more typed reasons so they appear in future lists. Accepts a single
// string or an array. Case-insensitive dedupe via the unique collated index.
async function rememberReason(reasons, createdBy = null) {
  const arr = Array.isArray(reasons) ? reasons : [reasons];
  for (const item of arr) {
    const r = String(item || '').trim();
    if (!r) continue;
    try {
      await RejectionReason.create({ reason: r, createdBy });
    } catch (err) {
      if (!(err && err.code === 11000)) throw err;
    }
  }
}

module.exports = { listReasons, rememberReason, DEFAULTS };
