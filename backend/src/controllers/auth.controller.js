// src/controllers/auth.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Auth Controller — Handles user registration and login logic.
//
// REGISTER: Creates a new user account with a hashed password.
// LOGIN:     Validates credentials and returns a signed JWT token.
// ─────────────────────────────────────────────────────────────────────────────


const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Generate JWT token for a user
// Payload contains user id, email, and name for quick access on frontend.
// ─────────────────────────────────────────────────────────────────────────────
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER
// POST /api/auth/register
//
// Purpose: Create a new user account.
// Body:    { name, email, password }
// Returns: 201 Created with JWT token and user info (no password hash)
// ─────────────────────────────────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    // 1. Validate request body (validation rules are defined in the route)
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { name, email, password } = req.body;

    // 2. Check if a user with this email already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists. Please login.',
      });
    }

    // 3. Hash the password using bcrypt (salt rounds = 12 for strong security)
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 4. Insert new user into database
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name.trim(), email.toLowerCase(), passwordHash]
    );

    const newUser = result.rows[0];

    // 5. Generate JWT token for the newly registered user
    const token = generateToken(newUser);

    // 6. Return success response (never return the password_hash)
    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        created_at: newUser.created_at,
      },
    });
  } catch (error) {
    // Pass error to global error handler middleware
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// POST /api/auth/login
//
// Purpose: Authenticate an existing user and return a JWT token.
// Body:    { email, password }
// Returns: 200 OK with JWT token and user info
//          401 Unauthorized if credentials are invalid
// ─────────────────────────────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    // 1. Validate request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;

    // 2. Find user by email (case-insensitive lookup)
    const result = await pool.query(
      'SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    const user = result.rows[0];

    // 3. If no user found with this email → generic error (avoid leaking info)
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // 4. Compare provided password against the stored bcrypt hash
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // 5. Generate JWT token for the authenticated user
    const token = generateToken(user);

    // 6. Return success response (never return password_hash)
    return res.status(200).json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET CURRENT USER (ME)
// GET /api/auth/me
//
// Purpose: Returns the currently logged-in user's profile.
// Requires: Valid JWT in Authorization header
// Returns:  200 OK with user info
// ─────────────────────────────────────────────────────────────────────────────
const getMe = async (req, res, next) => {
  try {
    // req.user is set by authMiddleware after token verification
    const result = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, getMe };
