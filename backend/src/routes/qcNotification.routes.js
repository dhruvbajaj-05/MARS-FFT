'use strict';

const express = require('express');
const controller = require('../controllers/qcReport.controller');
const protect = require('../middleware/protect');
const { validateObjectId } = require('../middleware/validate');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// Admin QC notifications (in-app). Customer notifications enable later by adding
// 'customer' rows scoped by customerId (see QCNotification model).
router.get('/', ...protect(ROLES.ADMIN), controller.listNotifications);
router.patch('/:id/read', ...protect(ROLES.ADMIN), validateObjectId('id'), controller.markNotificationRead);

module.exports = router;
