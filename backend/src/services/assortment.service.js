'use strict';

const mongoose = require('mongoose');
const Assortment = require('../models/Assortment');
const Product = require('../models/Product');
const { badRequest } = require('../utils/httpError');

// Shape an assortment for client responses.
function toPublicAssortment(doc, { customerId, productId } = {}) {
  if (!doc) {
    return {
      customerId: customerId ? String(customerId) : null,
      productId: productId ? String(productId) : null,
      parts: [],
      exists: false,
    };
  }
  return {
    id: doc._id.toString(),
    customerId: doc.customerId.toString(),
    productId: doc.productId.toString(),
    parts: (doc.parts || []).map((p) => ({ partName: p.partName, perSet: p.perSet, kind: p.kind || 'moulded' })),
    exists: true,
    updatedAt: doc.updatedAt,
  };
}

// Validate that a product exists and belongs to the customer.
async function validateProduct(customerId, productId) {
  for (const [key, value] of Object.entries({ customerId, productId })) {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw badRequest(`Invalid ${key}`, 'invalid_id');
    }
  }
  const product = await Product.findById(productId);
  if (!product) {
    throw badRequest('productId does not reference an existing product', 'invalid_product');
  }
  if (product.customerId.toString() !== String(customerId)) {
    throw badRequest('productId does not belong to the given customerId', 'product_customer_mismatch');
  }
  return product;
}

// Normalize + validate the parts array (partName + perSet).
function normalizeParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw badRequest('parts must be a non-empty array of { partName, perSet }', 'invalid_parts');
  }
  const seen = new Set();
  return parts.map((p) => {
    const partName = String(p.partName || '').trim();
    if (!partName) throw badRequest('Each assortment part needs a partName', 'invalid_parts');
    const key = partName.toLowerCase();
    if (seen.has(key)) throw badRequest(`Duplicate part in assortment: ${partName}`, 'duplicate_part');
    seen.add(key);
    const perSet = Number(p.perSet);
    if (!Number.isFinite(perSet) || perSet < 0) {
      throw badRequest(`perSet for ${partName} must be a number >= 0`, 'invalid_per_set');
    }
    const kind = p.kind === 'outsourced' ? 'outsourced' : 'moulded';
    return { partName, perSet, kind };
  });
}

// Get the saved assortment for a product (drives the dropdown suggestions + consumption).
// Returns { exists: false, parts: [] } when none is defined yet.
async function getAssortment(customerId, productId) {
  await validateProduct(customerId, productId);
  const doc = await Assortment.findOne({ customerId, productId });
  return toPublicAssortment(doc, { customerId, productId });
}

// Create or replace the assortment for a product (editable — last write wins).
async function upsertAssortment({ customerId, productId, parts, updatedBy }) {
  await validateProduct(customerId, productId);
  const normalized = normalizeParts(parts);
  const doc = await Assortment.findOneAndUpdate(
    { customerId, productId },
    { $set: { parts: normalized, updatedBy } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return toPublicAssortment(doc);
}

// Internal: fetch the raw assortment parts for consumption math (or [] if none).
async function getAssortmentParts(customerId, productId) {
  const doc = await Assortment.findOne({ customerId, productId }).lean();
  return doc ? doc.parts || [] : [];
}

// Merge a SINGLE part into the assortment without clobbering the others (used when the
// Moulding Engineer registers an outsourced part with its per-set requirement). Matches
// case-insensitively on partName; updates perSet/kind if present, else appends.
async function mergePart({ customerId, productId, partName, perSet, kind = 'moulded', updatedBy }) {
  const name = String(partName || '').trim();
  if (!name) return null;
  const doc = await Assortment.findOne({ customerId, productId });
  const parts = doc ? doc.parts.map((p) => ({ partName: p.partName, perSet: p.perSet, kind: p.kind || 'moulded' })) : [];
  const idx = parts.findIndex((p) => p.partName.toLowerCase() === name.toLowerCase());
  const entry = { partName: name, perSet: Number(perSet) || 0, kind: kind === 'outsourced' ? 'outsourced' : 'moulded' };
  if (idx >= 0) parts[idx] = entry;
  else parts.push(entry);
  const saved = await Assortment.findOneAndUpdate(
    { customerId, productId },
    { $set: { parts, updatedBy } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return toPublicAssortment(saved);
}

module.exports = {
  getAssortment,
  upsertAssortment,
  getAssortmentParts,
  mergePart,
  toPublicAssortment,
};
