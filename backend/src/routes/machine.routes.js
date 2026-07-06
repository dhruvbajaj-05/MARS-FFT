'use strict';

const express = require('express');
const machineController = require('../controllers/machine.controller');
const protect = require('../middleware/protect');
const { requireBody, validateObjectId } = require('../middleware/validate');
const { ROLES } = require('../utils/roles');

// Machine Master. Admin manages; Moulding Engineers only LIST (for the production
// dropdown). Machines are referenced by name string in records, so delete is always safe.
const router = express.Router();

// List — admin + moulding engineer (dropdown source).
router.get('/', ...protect(ROLES.ADMIN, ROLES.MOULDING_ENGINEER), machineController.list);

// Create / edit / delete — admin only.
router.post('/', ...protect(ROLES.ADMIN), requireBody(['name', 'category']), machineController.create);
router.patch('/:id', ...protect(ROLES.ADMIN), validateObjectId('id'), machineController.update);
router.delete('/:id', ...protect(ROLES.ADMIN), validateObjectId('id'), machineController.remove);

module.exports = router;
