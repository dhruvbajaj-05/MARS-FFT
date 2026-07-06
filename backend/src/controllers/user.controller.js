'use strict';

const userService = require('../services/user.service');

// POST /api/v1/users  (admin) — requireBody(['name','email','password','role'])
async function create(req, res, next) {
  try {
    const user = await userService.createUser({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      role: req.body.role,
      customerId: req.body.customerId,
    });
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/users  (admin) — ?role=&isActive=&page=&limit=
async function list(req, res, next) {
  try {
    const result = await userService.listUsers(req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/users/:id  (admin)
async function getById(req, res, next) {
  try {
    const user = await userService.getUserById(req.params.id);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/users/:id  (admin) — edit name/email/role/customer/password/active
async function update(req, res, next) {
  try {
    const user = await userService.updateUser(req.params.id, {
      name: req.body.name,
      email: req.body.email,
      role: req.body.role,
      customerId: req.body.customerId,
      password: req.body.password,
      isActive: req.body.isActive,
    });
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/users/:id  (admin) — hard delete (cannot delete self)
async function remove(req, res, next) {
  try {
    res.status(200).json(await userService.deleteUser(req.params.id, req.user.id));
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/users/:id/deactivate  (admin) — soft delete (no hard delete in V1)
async function deactivate(req, res, next) {
  try {
    const user = await userService.setUserActive(req.params.id, false, req.user.id);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/users/:id/reactivate  (admin) — re-enable a soft-deactivated account
async function reactivate(req, res, next) {
  try {
    const user = await userService.setUserActive(req.params.id, true, req.user.id);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getById, update, remove, deactivate, reactivate };
