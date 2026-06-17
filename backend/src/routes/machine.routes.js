'use strict';

const express = require('express');
const machineController = require('../controllers/machine.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { ROLES } = require('../utils/roles');

// Machine Master. Admin manages; Moulding Engineers only LIST (for the production
// dropdown). Machines are archived, never hard-deleted, so records keep referencing them.
const router = express.Router();

// List — admin + moulding engineer (dropdown source).
router.get('/', ...protect(ROLES.ADMIN, ROLES.MOULDING_ENGINEER), machineController.list);

// Create / edit / archive — admin only.
router.post('/', ...protect(ROLES.ADMIN), requireBody(['name', 'category']), machineController.create);
router.patch('/:id', ...protect(ROLES.ADMIN), validateObjectId('id'), machineController.update);
router.post('/:id/archive', ...protect(ROLES.ADMIN), validateObjectId('id'), machineController.archive);

module.exports = router;
