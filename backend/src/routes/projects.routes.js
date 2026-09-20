// src/routes/projects.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// Projects Routes — CRUD operations for CI/CD projects.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const { body } = require('express-validator');
const { 
  createProject, 
  getProjects, 
  getProjectById, 
  deleteProject,
  handleWebhook,
  getAutoTriggerConfig,
  updateAutoTrigger,
  getBranches
} = require('../controllers/projects.controller');
const authMiddleware = require('../middleware/authMiddleware');
const membersRoutes = require('./members.routes');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Public Webhook (No Auth Required for GitHub to ping)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/webhook/:id', handleWebhook);

// ─────────────────────────────────────────────────────────────────────────────
// Protected Routes (Require JWT Auth)
// ─────────────────────────────────────────────────────────────────────────────
router.use(authMiddleware);

// GET /api/projects — List all projects
router.get('/', getProjects);

// POST /api/projects — Create new project
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Project name is required.'),
    body('repo_url')
      .trim()
      .notEmpty().withMessage('Repository URL is required.')
      .isURL().withMessage('Please provide a valid GitHub repository URL.'),
  ],
  createProject
);

// GET /api/projects/:id/auto-trigger — Get auto-trigger configuration
router.get('/:id/auto-trigger', getAutoTriggerConfig);

// PUT /api/projects/:id/auto-trigger — Update auto-trigger configuration
router.put('/:id/auto-trigger', updateAutoTrigger);

// GET /api/projects/:id/branches — List the repo's branches (for the run dropdown)
router.get('/:id/branches', getBranches);

// /api/projects/:id/members — Team member management (list, add, remove)
router.use('/:id/members', membersRoutes);

// GET /api/projects/:id — Get details
router.get('/:id', getProjectById);

// DELETE /api/projects/:id — Delete project
router.delete('/:id', deleteProject);

module.exports = router;
