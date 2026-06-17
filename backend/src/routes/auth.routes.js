'use strict';

const express = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/auth');
const { requireBody } = require('../middleware/validate');

const router = express.Router();

// Public
router.post('/login', requireBody(['email', 'password']), authController.login);

// Protected (valid token required)
router.post('/refresh', authenticate, authController.refresh);
router.get('/me', authenticate, authController.me);
router.post('/logout', authenticate, authController.logout);

module.exports = router;


