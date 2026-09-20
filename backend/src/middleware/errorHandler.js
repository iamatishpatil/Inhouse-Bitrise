// src/middleware/errorHandler.js
// ─────────────────────────────────────────────────────────────────────────────
// Global Error Handler Middleware
// Catches any errors passed via next(error) from any route or controller.
// Must be registered LAST in app.js (after all routes).
//
// Returns a consistent JSON error response format:
//   { success: false, message: "...", stack: "..." (dev only) }
// ─────────────────────────────────────────────────────────────────────────────

const errorHandler = (err, req, res, next) => {
  // Log the full error to server console for debugging
  console.error('🔴 Error:', err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  // Default to 500 Internal Server Error if no status code was set
  const statusCode = err.statusCode || err.status || 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    // Only expose stack trace in development mode (never in production)
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
