// src/routes/secrets.routes.js
const express = require('express');
const router = express.Router();
const { getSecrets, addSecret, deleteSecret } = require('../controllers/secrets.controller');
const auth = require('../middleware/authMiddleware');

router.get('/project/:projectId', auth, getSecrets);
router.post('/project/:projectId', auth, addSecret);
router.delete('/:id', auth, deleteSecret);

module.exports = router;
