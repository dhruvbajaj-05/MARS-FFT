'use strict';

const RejectionReason = require('../models/RejectionReason');

const DEFAULTS = ['Short Shot', 'Flash', 'Burn Mark', 'Color Issue', 'Warping'];

// List remembered reasons (seeding the common defaults on first use). Returns plain
// strings sorted alphabetically for the dropdown.
async function listReasons() {
  const count = await RejectionReason.estimatedDocumentCount();
  if (count === 0) {
    await RejectionReason.insertMany(DEFAULTS.map((reason) => ({ reason })), { ordered: false }).catch(() => {});
  }
  const docs = await RejectionReason.find().sort({ reason: 1 }).lean();
  return { reasons: docs.map((d) => d.reason) };
}

// Remember a newly typed reason so it appears in future dropdowns. Case-insensitive
// dedupe via the unique collated index; silently ignores duplicates/races.
async function rememberReason(reason, createdBy = null) {
  const r = String(reason || '').trim();
  if (!r) return;
  try {
    await RejectionReason.create({ reason: r, createdBy });
  } catch (err) {
    if (!(err && err.code === 11000)) throw err;
  }
}

module.exports = { listReasons, rememberReason, DEFAULTS };
