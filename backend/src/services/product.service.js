'use strict';

const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const MouldingRecord = require('../models/MouldingRecord');
const { notFound, badRequest } = require('../utils/httpError');
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
  // Active-only by default (dropdowns); pass includeArchived=true to see archived too.
  if (String(query.includeArchived) !== 'true') {
    filter.status = { $ne: 'Archived' };
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

// Delete a product (admin). If it has ANY production history (orders or moulding records)
// it is ARCHIVED instead of removed, so historical OrderID tracking is never broken.
// Hard delete is only allowed for a product that was never used.
async function deleteProduct(id) {
  const product = await Product.findById(id);
  if (!product) {
    throw notFound('Product not found', 'product_not_found');
  }

  const [orderCount, mouldingCount] = await Promise.all([
    Order.countDocuments({ productId: id }),
    MouldingRecord.countDocuments({ productId: id }),
  ]);
  const hasHistory = orderCount > 0 || mouldingCount > 0;

  if (hasHistory) {
    if (product.status !== 'Archived') {
      product.status = 'Archived';
      product.archivedAt = new Date();
      await product.save();
    }
    return { id: String(id), archived: true, deleted: false };
  }

  await Product.deleteOne({ _id: id });
  return { id: String(id), archived: false, deleted: true };
}

module.exports = {
  createProduct,
  listProducts,
  getProductById,
  deleteProduct,
  toPublicProduct,
};
