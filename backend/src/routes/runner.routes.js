// src/routes/runner.routes.js
const express = require('express');
const { getRunnerStatus } = require('../controllers/runner.controller');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Protected route (Require JWT Auth)
router.use(authMiddleware);

// GET /api/runner/status
router.get('/status', getRunnerStatus);

module.exports = router;
