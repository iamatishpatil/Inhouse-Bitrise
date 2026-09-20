// src/routes/members.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// Members Routes — Team member management for a project.
//
// Routes:
//   GET    /api/projects/:id/members            → List all members
//   POST   /api/projects/:id/members            → Add a member (creates account if needed)
//   DELETE /api/projects/:id/members/:userId    → Remove a member
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const { listMembers, addMember, removeMember } = require('../controllers/members.controller');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router({ mergeParams: true }); // mergeParams to access :id from parent

// All routes require authentication
router.use(authMiddleware);

// GET /api/projects/:id/members — List all members of a project
router.get('/', listMembers);

// POST /api/projects/:id/members — Add a team member (owner only)
router.post('/', addMember);

// DELETE /api/projects/:id/members/:userId — Remove a team member (owner only)
router.delete('/:userId', removeMember);

module.exports = router;
