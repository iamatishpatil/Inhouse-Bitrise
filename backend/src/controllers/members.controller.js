// src/controllers/members.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Members Controller — Manages team members for a project.
//
// addMember:    Owner creates a user account + adds them to the project
// listMembers:  List all members (owner + invited)
// removeMember: Owner removes a member from the project (account stays)
// ─────────────────────────────────────────────────────────────────────────────

const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Check if requester is the project owner
// ─────────────────────────────────────────────────────────────────────────────
const isProjectOwner = async (projectId, userId) => {
  const result = await pool.query(
    'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
    [projectId, userId]
  );
  return result.rows.length > 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Check if requester has access to the project (owner or member)
// ─────────────────────────────────────────────────────────────────────────────
const hasProjectAccess = async (projectId, userId) => {
  const result = await pool.query(
    `SELECT 1 FROM projects WHERE id = $1 AND user_id = $2
     UNION
     SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId]
  );
  return result.rows.length > 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// LIST MEMBERS
// GET /api/projects/:id/members
//
// Returns: owner + all invited members for a project
// Access:  Owner or any project member
// ─────────────────────────────────────────────────────────────────────────────
const listMembers = async (req, res, next) => {
  try {
    const { id: projectId } = req.params;
    const requesterId = req.user.id;

    // Verify access
    const access = await hasProjectAccess(projectId, requesterId);
    if (!access) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // Get project owner
    const ownerResult = await pool.query(
      `SELECT u.id, u.name, u.email, p.created_at
       FROM projects p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = $1`,
      [projectId]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const owner = ownerResult.rows[0];

    // Get all invited members
    const membersResult = await pool.query(
      `SELECT u.id, u.name, u.email, pm.role, pm.created_at
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1
       ORDER BY pm.created_at ASC`,
      [projectId]
    );

    // Combine: owner first, then members
    const members = [
      {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: 'owner',
        created_at: owner.created_at,
        isYou: owner.id === requesterId,
      },
      ...membersResult.rows.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        created_at: m.created_at,
        isYou: m.id === requesterId,
      })),
    ];

    return res.status(200).json({ success: true, members });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADD MEMBER
// POST /api/projects/:id/members
// Body: { name, email, password, role }
//
// If account exists for email → add to project only
// If no account → create user account first, then add to project
// Access: Owner only
// ─────────────────────────────────────────────────────────────────────────────
const addMember = async (req, res, next) => {
  try {
    const { id: projectId } = req.params;
    const ownerId = req.user.id;

    // Verify requester is the owner
    const ownerCheck = await isProjectOwner(projectId, ownerId);
    if (!ownerCheck) {
      return res.status(403).json({
        success: false,
        message: 'Only the project owner can add members.',
      });
    }

    const { name, email, password, role } = req.body;

    // Validate required fields
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }
    if (!role || !['admin', 'viewer'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be "admin" or "viewer".' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Cannot add yourself
    const selfCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND email = $2', [ownerId, normalizedEmail]);
    if (selfCheck.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'You cannot add yourself as a member.' });
    }

    // Check if a user with this email already exists
    let userResult = await pool.query(
      'SELECT id, name, email FROM users WHERE email = $1',
      [normalizedEmail]
    );

    let targetUser;

    if (userResult.rows.length > 0) {
      // User already has an account — just add to project
      targetUser = userResult.rows[0];
    } else {
      // No account found — create one with the provided credentials
      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Name is required when creating a new account.' });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
      }

      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      const newUserResult = await pool.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email`,
        [name.trim(), normalizedEmail, passwordHash]
      );
      targetUser = newUserResult.rows[0];
      console.log(`👤 New user account created for ${normalizedEmail} by owner ${ownerId}`);
    }

    // Check if already a member
    const existingMember = await pool.query(
      'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, targetUser.id]
    );
    if (existingMember.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `${targetUser.email} is already a member of this project.`,
      });
    }

    // Add to project_members
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role, invited_by)
       VALUES ($1, $2, $3, $4)`,
      [projectId, targetUser.id, role, ownerId]
    );

    console.log(`✅ Member added: ${targetUser.email} as ${role} to project ${projectId}`);

    return res.status(201).json({
      success: true,
      message: `${targetUser.name} has been added to the project as ${role}.`,
      member: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REMOVE MEMBER
// DELETE /api/projects/:id/members/:userId
//
// Removes the user from project_members.
// Does NOT delete their user account — they can still log in.
// Access: Owner only
// ─────────────────────────────────────────────────────────────────────────────
const removeMember = async (req, res, next) => {
  try {
    const { id: projectId, userId: targetUserId } = req.params;
    const ownerId = req.user.id;

    // Verify requester is the owner
    const ownerCheck = await isProjectOwner(projectId, ownerId);
    if (!ownerCheck) {
      return res.status(403).json({
        success: false,
        message: 'Only the project owner can remove members.',
      });
    }

    // Cannot remove yourself (the owner)
    if (targetUserId === ownerId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot remove yourself as the project owner.',
      });
    }

    const result = await pool.query(
      'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2 RETURNING id',
      [projectId, targetUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in this project.',
      });
    }

    console.log(`🗑️  Member ${targetUserId} removed from project ${projectId}`);

    return res.status(200).json({
      success: true,
      message: 'Member removed from the project.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { listMembers, addMember, removeMember };
