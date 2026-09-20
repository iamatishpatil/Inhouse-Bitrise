// src/controllers/secrets.controller.js
const pool = require('../config/db');

const getSecrets = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT s.id, s.key, s.created_at, u.name as added_by_name
       FROM project_secrets s
       JOIN projects p ON s.project_id = p.id
       LEFT JOIN users u ON s.added_by = u.id
       WHERE s.project_id = $1 AND p.user_id = $2`,
      [projectId, userId]
    );

    res.status(200).json({ success: true, secrets: result.rows });
  } catch (error) {
    next(error);
  }
};

const addSecret = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { key, value } = req.body;
    const userId = req.user.id;

    // Verify ownership
    const projectCheck = await pool.query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
    if (projectCheck.rows.length === 0) return res.status(403).json({ success: false, message: 'Unauthorized' });

    const result = await pool.query(
      'INSERT INTO project_secrets (project_id, key, value, added_by) VALUES ($1, $2, $3, $4) RETURNING id, key, created_at, (SELECT name FROM users WHERE id = $4) as added_by_name',
      [projectId, key, value, userId]
    );

    res.status(201).json({ success: true, secret: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const deleteSecret = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `DELETE FROM project_secrets 
       WHERE id = $1 AND project_id IN (SELECT id FROM projects WHERE user_id = $2)`,
      [id, userId]
    );

    res.status(200).json({ success: true, message: 'Secret deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getSecrets, addSecret, deleteSecret };
