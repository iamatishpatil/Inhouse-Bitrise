// src/routes/auth.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// Auth Routes — Defines all authentication-related API endpoints.
//
// Routes:
//   POST   /api/auth/register  → Register a new user account
//   POST   /api/auth/login     → Login and receive a JWT token
//   GET    /api/auth/me        → Get current logged-in user's profile (protected)
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const { body } = require('express-validator');
const { register, login, getMe } = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// Register a brand new user account.
// Validation rules are applied before the controller runs.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/register',
  [
    // name: required, min 2 chars, max 100 chars
    body('name')
      .trim()
      .notEmpty().withMessage('Name is required.')
      .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters.'),

    // email: required, must be a valid email format
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required.')
      .isEmail().withMessage('Please provide a valid email address.')
      .normalizeEmail(),

    // password: required, minimum 6 characters
    body('password')
      .notEmpty().withMessage('Password is required.')
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.'),
  ],
  register
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Authenticate user with email and password, returns a JWT token.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/login',
  [
    // email: required and valid format
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required.')
      .isEmail().withMessage('Please provide a valid email address.'),

    // password: required
    body('password')
      .notEmpty().withMessage('Password is required.'),
  ],
  login
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
// Returns the currently authenticated user's profile.
// Requires: Valid JWT Bearer token in Authorization header.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', authMiddleware, getMe);

module.exports = router;
