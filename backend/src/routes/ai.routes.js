// src/routes/ai.routes.js
const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');
// TODO: Consider adding authentication middleware to this route if needed
// const { verifyToken } = require('../middleware/auth.middleware');

router.post('/', aiController.handleChat);

module.exports = router;
