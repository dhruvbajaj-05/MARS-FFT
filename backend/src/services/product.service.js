'use strict';

const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const MouldingRecord = require('../models/MouldingRecord');
const { notFound, badRequest, conflict } = require('../utils/httpError');
const { parsePagination, buildList } = require('../utils/pagination');

// Shape a product document for client responses.
function toPublicProduct(product) {
  return {
    id: product._id.toString(),
    customerId: product.customerId ? product.customerId.toString() : null,
    name: product.name,
    partName: product.partName || null,
    status: product.status || 'Active',
    createdBy: product.createdBy ? product.createdBy.toString() : null,
    createdAt: product.createdAt,
  };
}

// Create a product under an existing customer (admin only).
async function createProduct({ customerId, name, partName, createdBy }) {
  // A product must belong to a real customer.
  const customerExists = await Customer.exists({ _id: customerId });
  if (!customerExists) {
    throw badRequest('customerId does not reference an existing customer', 'invalid_customer');
  }

  const product = await Product.create({
    customerId,
    name: String(name).trim(),
    partName: partName ? String(partName).trim() : undefined,
    createdBy,
  });
  return toPublicProduct(product);
}

// List products, optionally filtered by customerId (drives the cascading dropdown).
async function listProducts(query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (query.customerId) {
    filter.customerId = query.customerId;
  }
  if (query.search && String(query.search).trim() !== '') {
    filter.name = { $regex: String(query.search).trim(), $options: 'i' };
  }

  const [items, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);

  return buildList(items.map(toPublicProduct), total, page, limit);
}

// Fetch a single product or throw 404.
async function getProductById(id) {
  const product = await Product.findById(id);
  if (!product) {
    throw notFound('Product not found', 'product_not_found');
  }
  return toPublicProduct(product);
}

// Edit a product (admin).
async function updateProduct(id, { name, partName }) {
  const product = await Product.findById(id);
  if (!product) {
    throw notFound('Product not found', 'product_not_found');
  }
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) throw badRequest('Product name is required', 'missing_name');
    product.name = trimmed;
  }
  if (partName !== undefined) {
    product.partName = partName ? String(partName).trim() : undefined;
  }
  await product.save();
  return toPublicProduct(product);
}

// Delete a product (admin). Blocked (409) when it has ANY production history (orders or
// moulding records) so historical OrderID tracking is never broken; otherwise hard-deleted.
async function deleteProduct(id) {
  const product = await Product.findById(id);
  if (!product) {
    throw notFound('Product not found', 'product_not_found');
  }

  const [orderCount, mouldingCount] = await Promise.all([
    Order.countDocuments({ productId: id }),
    MouldingRecord.countDocuments({ productId: id }),
  ]);

  if (orderCount > 0 || mouldingCount > 0) {
    const parts = [];
    if (orderCount > 0) parts.push(`${orderCount} order(s)`);
    if (mouldingCount > 0) parts.push(`${mouldingCount} moulding record(s)`);
    throw conflict(
      `Cannot delete "${product.name}" — it still has ${parts.join(', ')}. ` +
        'Manufacturing history must be preserved. Delete those first.',
      'product_in_use'
    );
  }

  await Product.deleteOne({ _id: id });
  return { id: String(id), deleted: true };
}

module.exports = {
  createProduct,
  listProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  toPublicProduct,
};
