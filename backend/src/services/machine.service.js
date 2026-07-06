'use strict';

const mongoose = require('mongoose');
const Machine = require('../models/Machine');
const { badRequest, notFound, conflict } = require('../utils/httpError');

// Machine Master. Admin manages (add/edit/archive); Moulding Engineers only list+select.

const CATEGORIES = Machine.CATEGORIES; // ['injection', 'blow']

function toPublic(m) {
  return {
    id: m._id.toString(),
    name: m.name,
    category: m.category,
    createdAt: m.createdAt,
  };
}

function normalize({ name, category }) {
  const n = String(name || '').trim();
  if (!n) throw badRequest('Machine name is required', 'missing_name');
  if (category !== undefined && !CATEGORIES.includes(category)) {
    throw badRequest(`category must be one of: ${CATEGORIES.join(', ')}`, 'invalid_category');
  }
  return { name: n, category };
}

async function createMachine({ name, category, createdBy }) {
  const norm = normalize({ name, category });
  if (!norm.category) throw badRequest(`category must be one of: ${CATEGORIES.join(', ')}`, 'invalid_category');
  try {
    const m = await Machine.create({ name: norm.name, category: norm.category, createdBy });
    return toPublic(m);
  } catch (err) {
    if (err && err.code === 11000) throw conflict('A machine with that name already exists', 'machine_exists');
    throw err;
  }
}

// List machines. Optionally filter by category.
async function listMachines(query = {}) {
  const filter = {};
  if (query.category && CATEGORIES.includes(query.category)) filter.category = query.category;
  const items = await Machine.find(filter).sort({ category: 1, name: 1 }).lean();
  return { machines: items.map(toPublic) };
}

async function updateMachine(id, { name, category }) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid id', 'invalid_id');
  const m = await Machine.findById(id);
  if (!m) throw notFound('Machine not found', 'machine_not_found');
  if (name !== undefined) m.name = String(name).trim();
  if (category !== undefined) {
    if (!CATEGORIES.includes(category)) throw badRequest(`category must be one of: ${CATEGORIES.join(', ')}`, 'invalid_category');
    m.category = category;
  }
  try {
    await m.save();
  } catch (err) {
    if (err && err.code === 11000) throw conflict('A machine with that name already exists', 'machine_exists');
    throw err;
  }
  return toPublic(m);
}

// Hard-delete a machine. Moulding records store the machine as a plain string
// (machineNumber), never as a reference, so removing a machine never breaks history.
async function deleteMachine(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest('Invalid id', 'invalid_id');
  const m = await Machine.findById(id);
  if (!m) throw notFound('Machine not found', 'machine_not_found');
  await Machine.deleteOne({ _id: id });
  return { id: String(id), deleted: true };
}

module.exports = { createMachine, listMachines, updateMachine, deleteMachine, toPublic };
