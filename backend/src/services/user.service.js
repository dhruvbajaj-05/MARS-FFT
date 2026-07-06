'use strict';

const User = require('../models/User');
const Customer = require('../models/Customer');
const { ALL_ROLES, ROLES } = require('../utils/roles');
const { badRequest, notFound, conflict } = require('../utils/httpError');
const { parsePagination, buildList } = require('../utils/pagination');
const { hashPassword, toPublicUser } = require('./auth.service');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// Create a user account (admin only — V1 has no public signup).
// Enforces role validity, the customer-link rule, password strength, and unique email.
async function createUser({ name, email, password, role, customerId }) {
  if (!ALL_ROLES.includes(role)) {
    throw badRequest(`role must be one of: ${ALL_ROLES.join(', ')}`, 'invalid_role');
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw badRequest('A valid email is required', 'invalid_email');
  }

  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(
      `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      'weak_password'
    );
  }

  // Customer-link rule (mirrors the User model's pre-validate hook, with clearer errors).
  let linkedCustomerId = null;
  if (role === ROLES.CUSTOMER) {
    if (!customerId) {
      throw badRequest('customerId is required when role is "customer"', 'customer_id_required');
    }
    const customerExists = await Customer.exists({ _id: customerId });
    if (!customerExists) {
      throw badRequest('customerId does not reference an existing customer', 'invalid_customer');
    }
    linkedCustomerId = customerId;
  } else if (customerId) {
    throw badRequest('customerId must be omitted for non-customer roles', 'customer_id_forbidden');
  }

  // Fail fast on duplicate email (the unique index is the ultimate guard).
  const exists = await User.exists({ email: normalizedEmail });
  if (exists) {
    throw conflict('A user with this email already exists', 'email_taken');
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash,
    role,
    customerId: linkedCustomerId,
    isActive: true,
  });

  return toPublicUser(user);
}

// List users with optional role / isActive filters + pagination.
async function listUsers(query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (query.role) {
    if (!ALL_ROLES.includes(query.role)) {
      throw badRequest(`role must be one of: ${ALL_ROLES.join(', ')}`, 'invalid_role');
    }
    filter.role = query.role;
  }
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === 'true' || query.isActive === true;
  }

  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return buildList(items.map(toPublicUser), total, page, limit);
}

// Fetch a single user or throw 404.
async function getUserById(id) {
  const user = await User.findById(id);
  if (!user) {
    throw notFound('User not found', 'user_not_found');
  }
  return toPublicUser(user);
}

// Edit a user (admin). Any subset of {name, email, role, customerId, password, isActive}
// may be supplied. Re-validates email uniqueness, the customer-link rule, and password
// strength (only when a new password is provided).
async function updateUser(id, { name, email, role, customerId, password, isActive }) {
  const user = await User.findById(id);
  if (!user) {
    throw notFound('User not found', 'user_not_found');
  }

  if (name !== undefined) user.name = String(name).trim();

  if (email !== undefined) {
    const normalizedEmail = String(email).toLowerCase().trim();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw badRequest('A valid email is required', 'invalid_email');
    }
    if (normalizedEmail !== user.email) {
      const exists = await User.exists({ email: normalizedEmail, _id: { $ne: user._id } });
      if (exists) throw conflict('A user with this email already exists', 'email_taken');
      user.email = normalizedEmail;
    }
  }

  // Role / customer-link changes must keep the customer rule consistent.
  const nextRole = role !== undefined ? role : user.role;
  if (role !== undefined) {
    if (!ALL_ROLES.includes(role)) {
      throw badRequest(`role must be one of: ${ALL_ROLES.join(', ')}`, 'invalid_role');
    }
    user.role = role;
  }
  if (nextRole === ROLES.CUSTOMER) {
    const nextCustomerId = customerId !== undefined ? customerId : user.customerId;
    if (!nextCustomerId) {
      throw badRequest('customerId is required when role is "customer"', 'customer_id_required');
    }
    const customerExists = await Customer.exists({ _id: nextCustomerId });
    if (!customerExists) {
      throw badRequest('customerId does not reference an existing customer', 'invalid_customer');
    }
    user.customerId = nextCustomerId;
  } else {
    if (customerId) {
      throw badRequest('customerId must be omitted for non-customer roles', 'customer_id_forbidden');
    }
    user.customerId = null;
  }

  if (password !== undefined && password !== null && password !== '') {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw badRequest(`password must be at least ${MIN_PASSWORD_LENGTH} characters`, 'weak_password');
    }
    user.passwordHash = await hashPassword(password);
  }

  if (isActive !== undefined) {
    user.isActive = isActive === true || isActive === 'true';
  }

  await user.save();
  return toPublicUser(user);
}

// Hard-delete a user (admin). An admin cannot delete their own account.
async function deleteUser(id, actingUserId) {
  if (String(id) === String(actingUserId)) {
    throw badRequest('You cannot delete your own account', 'self_deletion');
  }
  const user = await User.findById(id);
  if (!user) {
    throw notFound('User not found', 'user_not_found');
  }
  await User.deleteOne({ _id: id });
  return { id: String(id), deleted: true };
}

// Set a user's active flag. `actingUserId` guards against an admin locking themselves out.
async function setUserActive(id, isActive, actingUserId) {
  if (!isActive && String(id) === String(actingUserId)) {
    throw badRequest('You cannot deactivate your own account', 'self_deactivation');
  }

  const user = await User.findById(id);
  if (!user) {
    throw notFound('User not found', 'user_not_found');
  }

  if (user.isActive === isActive) {
    // Idempotent — already in the requested state.
    return toPublicUser(user);
  }

  user.isActive = isActive;
  await user.save();
  return toPublicUser(user);
}

module.exports = {
  createUser,
  listUsers,
  getUserById,
  updateUser,
  deleteUser,
  setUserActive,
};
