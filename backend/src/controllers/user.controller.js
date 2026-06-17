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

module.exports = { create, list, getById, deactivate, reactivate };
