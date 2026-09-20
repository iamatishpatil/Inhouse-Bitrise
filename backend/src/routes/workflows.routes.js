// src/routes/workflows.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// Workflows Routes — Endpoints for managing build workflows.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const { body } = require('express-validator');
const {
  createWorkflow,
  getWorkflowsByProject,
  getWorkflowById,
  deleteWorkflow,
  updateWorkflow,
  getWorkflowVersions,
  restoreWorkflowVersion,
  updateWorkflowVersionMessage,
} = require('../controllers/workflows.controller');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// All workflow routes require authentication
router.use(authMiddleware);

// GET /api/workflows/project/:projectId — List workflows for a project
router.get('/project/:projectId', getWorkflowsByProject);

// GET /api/workflows/:id/versions — Get version history for a workflow
router.get('/:id/versions', getWorkflowVersions);

// GET /api/workflows/:id — Get a single workflow by ID
router.get('/:id', getWorkflowById);

// POST /api/workflows/:id/versions/:version/restore — Restore a specific version
router.post('/:id/versions/:version/restore', restoreWorkflowVersion);

// PUT /api/workflows/:id/versions/:version/message — Update version commit message
router.put('/:id/versions/:version/message', updateWorkflowVersionMessage);

// POST /api/workflows — Create a new workflow
router.post(
  '/',
  [
    body('project_id').isUUID().withMessage('Valid Project ID is required.'),
    body('name').trim().notEmpty().withMessage('Workflow name is required.'),
    body('steps').custom((value, { req }) => {
      // If yml_config is missing, then steps must be a non-empty array
      if (!req.body.yml_config && (!Array.isArray(value) || value.length === 0)) {
        throw new Error('At least one step or a YAML config is required.');
      }
      return true;
    }),
  ],
  createWorkflow
);

// DELETE /api/workflows/:id — Delete a workflow
router.delete('/:id', deleteWorkflow);

// PUT /api/workflows/:id — Update an existing workflow
router.put(
  '/:id',
  [
    body('name').trim().notEmpty().withMessage('Workflow name is required.'),
    body('steps').custom((value, { req }) => {
      if (!req.body.yml_config && (!Array.isArray(value) || value.length === 0)) {
        throw new Error('At least one step or a YAML config is required.');
      }
      return true;
    }),
  ],
  updateWorkflow
);

module.exports = router;
