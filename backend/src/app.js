// src/app.js
// ─────────────────────────────────────────────────────────────────────────────
// Express Application Setup
// Configures all middleware, mounts all route modules, and sets up
// the global error handler.
//
// Architecture:
//   server.js → app.js → routes/* → controllers/* → services/*
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Import route modules
const authRoutes = require('./routes/auth.routes');
const projectRoutes = require('./routes/projects.routes');
const workflowRoutes = require('./routes/workflows.routes');
const buildRoutes = require('./routes/builds.routes');
const secretRoutes = require('./routes/secrets.routes');
const runnerRoutes = require('./routes/runner.routes');
const aiRoutes = require('./routes/ai.routes');
const searchRoutes = require('./routes/search.routes');

// Import global error handler (must be last)
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ─────────────────────────────────────────────────────────────────────────────
// Core Middleware
// ─────────────────────────────────────────────────────────────────────────────

// Enable CORS — allows frontend to call this API
// Allow defaults + anything in CORS_ORIGINS (comma-separated list in your .env).
const corsOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  ...(process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
];
app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Parse incoming JSON request bodies (req.body)
// The verify callback captures the raw body buffer for webhook HMAC signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    // Only capture raw body for webhook routes (used for GitHub HMAC verification)
    if (req.originalUrl && req.originalUrl.includes('/webhook/')) {
      req.rawBody = buf.toString();
    }
  }
}));

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// HTTP request logger (shows method, url, status, response time)
// 'dev' format: colorful, concise output for development
app.use(morgan('dev'));

// Serve build artifacts statically
app.use('/artifacts', express.static(path.join(__dirname, '../public/artifacts')));

// ─────────────────────────────────────────────────────────────────────────────
// Health Check Route
// GET /health — Quick ping to verify the server is alive.
// Useful for monitoring tools and deployment checks.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: '🟢 Ddeploy API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// API Routes
// All routes are prefixed with /api/
// ─────────────────────────────────────────────────────────────────────────────

// Auth routes: /api/auth/register, /api/auth/login, /api/auth/me
app.use('/api/auth', authRoutes);

// Project routes: /api/projects (CRUD)
app.use('/api/projects', projectRoutes);

// Workflow routes: /api/workflows (CRUD, individual workflow operations)
app.use('/api/workflows', workflowRoutes);

// Build routes: /api/builds (trigger + status)
app.use('/api/builds', buildRoutes);

// Secret routes: /api/secrets
app.use('/api/secrets', secretRoutes);

// Runner routes: /api/runner
app.use('/api/runner', runnerRoutes);

// AI Chat routes: /api/chat
app.use('/api/chat', aiRoutes);

// Global Search routes: /api/search
app.use('/api/search', searchRoutes);

// Public install page route (NO auth — anyone with the link can access)
app.use('/api/public', require('./routes/public.routes'));

// ─────────────────────────────────────────────────────────────────────────────
// 404 Handler
// Catches any request that didn't match any route above.
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Global Error Handler (must be registered LAST)
// Catches errors passed via next(error) from any controller.
// ─────────────────────────────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
