'use strict';

const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { notFound, badRequest, conflict } = require('../utils/httpError');
const { parsePagination, buildList } = require('../utils/pagination');

// Shape a customer document for client responses.
function toPublicCustomer(customer) {
  return {
    id: customer._id.toString(),
    name: customer.name,
    createdBy: customer.createdBy ? customer.createdBy.toString() : null,
    createdAt: customer.createdAt,
  };
}

// Create a customer (admin only). `createdBy` is the acting admin's user id.
async function createCustomer({ name, createdBy }) {
  const customer = await Customer.create({
    name: String(name).trim(),
    createdBy,
  });
  return toPublicCustomer(customer);
}

// List customers with optional case-insensitive name search + pagination.
async function listCustomers(query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (query.search && String(query.search).trim() !== '') {
    filter.name = { $regex: String(query.search).trim(), $options: 'i' };
  }

  const [items, total] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Customer.countDocuments(filter),
  ]);

  return buildList(items.map(toPublicCustomer), total, page, limit);
}

// Fetch a single customer or throw 404.
async function getCustomerById(id) {
  const customer = await Customer.findById(id);
  if (!customer) {
    throw notFound('Customer not found', 'customer_not_found');
  }
  return toPublicCustomer(customer);
}

// Safe-delete a customer (admin only). A customer that owns any manufacturing data —
// products, orders (and therefore moulding/assembly/QC/dispatch records + store stock
// hanging off those orders) or portal users — is NEVER physically removed, so production
// history is preserved. In that case deletion is blocked with a clear, actionable message.
// Only a customer with no related data is hard-deleted.
async function deleteCustomer(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw badRequest('Invalid customer id', 'invalid_id');
  }

  const customer = await Customer.findById(id);
  if (!customer) {
    throw notFound('Customer not found', 'customer_not_found');
  }

  const [productCount, orderCount, userCount] = await Promise.all([
    Product.countDocuments({ customerId: id }),
    Order.countDocuments({ customerId: id }),
    User.countDocuments({ customerId: id }),
  ]);

  if (productCount > 0 || orderCount > 0 || userCount > 0) {
    const parts = [];
    if (productCount > 0) parts.push(`${productCount} product(s)`);
    if (orderCount > 0) parts.push(`${orderCount} order(s)`);
    if (userCount > 0) parts.push(`${userCount} portal user(s)`);
    throw conflict(
      `Cannot delete "${customer.name}" — it still has ${parts.join(', ')}. ` +
        'Manufacturing history must be preserved. Remove or reassign these first.',
      'customer_in_use'
    );
  }

  await Customer.deleteOne({ _id: id });
  return { id: String(id), deleted: true };
}

module.exports = {
  createCustomer,
  listCustomers,
  getCustomerById,
  deleteCustomer,
  toPublicCustomer,
};
