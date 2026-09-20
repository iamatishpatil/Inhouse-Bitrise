// src/routes/builds.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// Builds Routes — Triggering and monitoring CI/CD builds.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const { body } = require('express-validator');
const {
  triggerBuild,
  getBuildsByProject,
  getRecentBuilds,
  getBuildById,
  abortBuild,
  deployToS3,
  deployToTestFlight,
  shareToTeams,
  uploadArtifact
} = require('../controllers/builds.controller');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// INTERNAL: POST /api/builds/:id/log — Stream logs from runner to API
// (Placed above authMiddleware so runner can post without a user session)
router.post('/:id/log', require('../controllers/builds.controller').streamLog);

// All build routes below require authentication
router.use(authMiddleware);

// GET /api/builds/recent — Global recent-builds feed across all accessible projects
// (must be declared before '/:id' so 'recent' isn't matched as a build id)
router.get('/recent', getRecentBuilds);

// GET /api/builds/project/:projectId — List builds for a project (paginated)
router.get('/project/:projectId', getBuildsByProject);

// POST /api/builds/upload — Upload a distributable artifact (.ipa/.apk/.aab)
// Raw file bytes in the body; project_id + version as query params.
router.post('/upload', uploadArtifact);

// POST /api/builds — Trigger a new build
router.post(
  '/',
  [
    body('project_id').isUUID().withMessage('Valid Project ID is required.'),
    body('workflow_id').isUUID().withMessage('Valid Workflow ID is required.'),
  ],
  triggerBuild
);

// GET /api/builds/:id — Get specific build details (and full logs)
router.get('/:id', getBuildById);

// POST /api/builds/:id/abort — Stop a running build
router.post('/:id/abort', abortBuild);

// POST /api/builds/:id/deploy-s3 — Manually deploy an existing build to S3
router.post('/:id/deploy-s3', deployToS3);

// POST /api/builds/:id/deploy-testflight — Manually deploy an existing build to TestFlight
router.post('/:id/deploy-testflight', deployToTestFlight);

// POST /api/builds/:id/share-teams — Share build link to Microsoft Teams channel
router.post('/:id/share-teams', shareToTeams);

module.exports = router;
