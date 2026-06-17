'use strict';

const machineService = require('../services/machine.service');

async function list(req, res, next) {
  try {
    res.status(200).json(await machineService.listMachines(req.query));
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const machine = await machineService.createMachine({
      name: req.body.name,
      category: req.body.category,
      createdBy: req.user.id,
    });
    res.status(201).json({ machine });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const machine = await machineService.updateMachine(req.params.id, {
      name: req.body.name,
      category: req.body.category,
    });
    res.status(200).json({ machine });
  } catch (err) {
    next(err);
  }
}

async function archive(req, res, next) {
  try {
    const machine = await machineService.archiveMachine(req.params.id, req.body.archived !== false);
    res.status(200).json({ machine });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, archive };
