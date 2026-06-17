'use strict';

const mongoose = require('mongoose');
const MoldDefinition = require('../models/MoldDefinition');
const { badRequest } = require('../utils/httpError');

// Shape a mold definition for client responses. Each item carries `defaultPartName`,
// `cavity` and `requiredShots` so the moulding screen can auto-fill Part Name + Cavity
// on selection and compute the production target without a second round-trip.
function toPublicMold(mold) {
  return {
    id: mold._id.toString(),
    customerId: mold.customerId.toString(),
    productId: mold.productId.toString(),
    moldName: mold.moldName,
    partName: mold.defaultPartName,
    defaultPartName: mold.defaultPartName,
    cavity: mold.cavity,
    requiredShots: mold.requiredShots,
    requiredQuantity: (mold.requiredShots || 0) * (mold.cavity || 0),
    usageCount: mold.usageCount,
    lastUsedAt: mold.lastUsedAt,
    createdAt: mold.createdAt,
  };
}

// Explicitly create or edit a mold (updated workflow — the Moulding Engineer defines
// molds before/while producing). Upsert on (productId, moldName): on insert the full
// definition is written; on edit partName/cavity/requiredShots are overwritten so the
// definition stays editable. Idempotent + concurrency-safe via the unique index.
async function upsertMold({ customerId, productId, moldName, partName, cavity, requiredShots, createdBy }) {
  for (const [key, value] of Object.entries({ customerId, productId })) {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw badRequest(`Invalid ${key}`, 'invalid_id');
    }
  }
  const name = String(moldName || '').trim();
  const part = String(partName || '').trim();
  if (!name) throw badRequest('moldName is required', 'missing_mold_name');
  if (!part) throw badRequest('partName is required', 'missing_part');

  const cav = Number(cavity);
  if (!Number.isFinite(cav) || cav < 1) {
    throw badRequest('cavity must be a number >= 1', 'invalid_cavity');
  }
  const shots = requiredShots === undefined || requiredShots === null || requiredShots === ''
    ? 0
    : Number(requiredShots);
  if (!Number.isFinite(shots) || shots < 0) {
    throw badRequest('requiredShots must be a number >= 0', 'invalid_required_shots');
  }

  const now = new Date();
  const mold = await MoldDefinition.findOneAndUpdate(
    { productId, moldName: name },
    {
      $set: { defaultPartName: part, cavity: cav, requiredShots: shots, lastUsedAt: now },
      $setOnInsert: { customerId, createdBy },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return toPublicMold(mold);
}

// Learn (or reinforce) a Product → Mold → Part relationship from a moulding submission.
//
// First-wins on identity fields written only on insert ($setOnInsert); every submission
// increments usageCount and refreshes lastUsedAt. cavity/requiredShots are seeded on
// insert too (so a never-before-seen mold still gets its production attributes) but are
// NOT overwritten here — explicit edits go through upsertMold. Idempotent and
// concurrency-safe via the unique (productId, moldName) index.
async function learnMold({ customerId, productId, moldName, partName, cavity, requiredShots, createdBy }) {
  const filter = { productId, moldName };
  const now = new Date();
  const setOnInsert = { customerId, defaultPartName: partName, createdBy };
  if (cavity !== undefined && cavity !== null) setOnInsert.cavity = cavity;
  if (requiredShots !== undefined && requiredShots !== null) setOnInsert.requiredShots = requiredShots;

  const update = {
    $setOnInsert: setOnInsert,
    $inc: { usageCount: 1 },
    $set: { lastUsedAt: now },
  };
  const options = { upsert: true, new: true, setDefaultsOnInsert: true };

  try {
    return await MoldDefinition.findOneAndUpdate(filter, update, options);
  } catch (err) {
    // Lost an upsert race with a concurrent submission of the same (product, mold):
    // the document now exists, so re-apply only the reinforcement.
    if (err && err.code === 11000) {
      return MoldDefinition.findOneAndUpdate(
        filter,
        { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } },
        { new: true }
      );
    }
    throw err;
  }
}

// List the learned molds for a product, most-used first (drives the dropdown +
// autofill). Returns an empty list when the product has no learned molds yet.
async function listMoldsForProduct(productId) {
  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    throw badRequest('A valid productId query parameter is required', 'invalid_product');
  }

  const molds = await MoldDefinition.find({ productId }).sort({ usageCount: -1, lastUsedAt: -1 });
  return {
    productId: String(productId),
    molds: molds.map(toPublicMold),
  };
}

// Look up a single learned mold by (product, moldName) — used by moulding production to
// resolve cavity/requiredShots server-side (never trust client-supplied cavity).
async function findMold(productId, moldName) {
  if (!mongoose.Types.ObjectId.isValid(productId)) return null;
  return MoldDefinition.findOne({ productId, moldName: String(moldName || '').trim() });
}

module.exports = {
  upsertMold,
  learnMold,
  listMoldsForProduct,
  findMold,
  toPublicMold,
};
