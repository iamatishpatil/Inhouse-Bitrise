// src/middleware/authMiddleware.js
// ─────────────────────────────────────────────────────────────────────────────
// JWT Authentication Middleware
// Protects routes that require a logged-in user.
//
// How it works:
//   1. Reads the "Authorization" header from the request
//   2. Expects format: "Bearer <token>"
//   3. Verifies the token using the JWT_SECRET
//   4. Attaches decoded user payload to req.user
//   5. If token is missing or invalid → responds with 401 Unauthorized
// ─────────────────────────────────────────────────────────────────────────────

const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists in current DB
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [decoded.id]);
    if (userCheck.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists in database. Please register again.',
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token. Please login again.',
    });
  }
};

module.exports = authMiddleware;
