// src/controllers/workflows.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Workflows Controller — Manages CI/CD steps and configurations.
// Each workflow belongs to a project and contains a series of executable steps.
// Versioning: every update snapshots the previous state into workflow_versions.
// ─────────────────────────────────────────────────────────────────────────────

const { validationResult } = require('express-validator');
const pool = require('../config/db');
const yaml = require('js-yaml');

// ─────────────────────────────────────────────────────────────────────────────
// CREATE WORKFLOW
// POST /api/workflows
// Body: { project_id, name, steps }
// ─────────────────────────────────────────────────────────────────────────────
const createWorkflow = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { project_id, name, steps, yml_config, platform } = req.body;
    const userId = req.user.id;

    // Verify project belongs to the user
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [project_id, userId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized: Project not found or does not belong to you.' 
      });
    }

    const result = await pool.query(
      `INSERT INTO workflows (project_id, name, steps, yml_config, platform, version)
       VALUES ($1, $2, $3, $4, $5, 1)
       RETURNING *`,
      [project_id, name, JSON.stringify(steps || []), yml_config, platform || 'android']
    );

    return res.status(201).json({
      success: true,
      message: 'Workflow created successfully!',
      workflow: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL WORKFLOWS FOR A PROJECT
// GET /api/workflows/project/:projectId
// Access: Owner OR any project member (admin/viewer)
// ─────────────────────────────────────────────────────────────────────────────
const getWorkflowsByProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    // Allow owner OR any invited member
    const projectCheck = await pool.query(
      `SELECT p.id FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
       WHERE p.id = $1 AND (p.user_id = $2 OR pm.user_id = $2)`,
      [projectId, userId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const result = await pool.query(
      `SELECT w.*, u.name as last_changed_by
       FROM workflows w
       LEFT JOIN LATERAL (
         SELECT saved_by
         FROM workflow_versions wv
         WHERE wv.workflow_id = w.id
         ORDER BY wv.version_number DESC
         LIMIT 1
       ) latest_v ON true
       LEFT JOIN users u ON u.id = latest_v.saved_by
       WHERE w.project_id = $1
       ORDER BY w.created_at ASC`,
      [projectId]
    );

    return res.status(200).json({
      success: true,
      workflows: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE WORKFLOW BY ID
// GET /api/workflows/:id
// Access: Owner OR any project member (admin/viewer)
// ─────────────────────────────────────────────────────────────────────────────
const getWorkflowById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT w.* FROM workflows w
       JOIN projects p ON p.id = w.project_id
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
       WHERE w.id = $1 AND (p.user_id = $2 OR pm.user_id = $2)`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Workflow not found or access denied.' });
    }

    const workflow = result.rows[0];

    // If the workflow has yml_config but steps is empty, parse it into visual blocks!
    if (workflow.yml_config && (!workflow.steps || workflow.steps.length === 0)) {
      try {
        const parsed = yaml.load(workflow.yml_config);
        if (parsed && parsed.workflows) {
          // Grab the first workflow defined in the YAML
          const firstWfKey = Object.keys(parsed.workflows)[0];
          const rawSteps = parsed.workflows[firstWfKey]?.steps || [];
          
          workflow.steps = rawSteps.map((s, index) => {
            const stepKey = Object.keys(s)[0]; // e.g., 'script@1'
            const stepData = s[stepKey];
            
            // Try to extract the bash script if it's a script step
            let command = '';
            if (stepData.inputs && Array.isArray(stepData.inputs)) {
               const contentInput = stepData.inputs.find(i => i.content);
               if (contentInput) command = contentInput.content;
            }
            
            return {
              name: stepData.title || stepKey || `Step ${index + 1}`,
              command: command || `echo "Custom step: ${stepKey}"`
            };
          });
        }
      } catch (err) {
        console.error('Failed to parse YAML workflow for Architect:', err);
      }
    }

    return res.status(200).json({
      success: true,
      workflow,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE WORKFLOW
// DELETE /api/workflows/:id
// ─────────────────────────────────────────────────────────────────────────────
const deleteWorkflow = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify ownership via project join
    const result = await pool.query(
      `DELETE FROM workflows 
       WHERE id = $1 AND project_id IN (SELECT id FROM projects WHERE user_id = $2)
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Workflow not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Workflow deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE WORKFLOW  (with versioning snapshot)
// PUT /api/workflows/:id
// ─────────────────────────────────────────────────────────────────────────────
const updateWorkflow = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, steps, yml_config, platform } = req.body;
    const userId = req.user.id;

    // Verify ownership via project join
    const ownershipCheck = await pool.query(
      'SELECT * FROM workflows WHERE id = $1 AND project_id IN (SELECT id FROM projects WHERE user_id = $2)',
      [id, userId]
    );

    if (ownershipCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Workflow not found or access denied.' });
    }

    const current = ownershipCheck.rows[0];

    // Check if anything actually changed
    const stepsStr = JSON.stringify(steps || []);
    const currentStepsStr = JSON.stringify(current.steps || []);
    const currentPlatform = current.platform || 'android';
    const newPlatform = platform || 'android';
    
    if (
      current.name === name &&
      current.yml_config === yml_config &&
      currentPlatform === newPlatform &&
      currentStepsStr === stepsStr
    ) {
      return res.status(200).json({
        success: true,
        message: 'No changes detected, version unchanged.',
        workflow: current,
      });
    }

    const nextVersion = (current.version || 1) + 1;

    // Snapshot current state into workflow_versions before overwriting
    await pool.query(
      `INSERT INTO workflow_versions 
         (workflow_id, version_number, name, steps, yml_config, platform, saved_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        current.version || 1,
        current.name,
        current.steps,
        current.yml_config,
        current.platform,
        userId,
      ]
    );

    const result = await pool.query(
      `UPDATE workflows 
       SET name = $1, steps = $2, yml_config = $3, platform = $4, version = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [name, JSON.stringify(steps || []), yml_config, platform || 'android', nextVersion, id]
    );

    return res.status(200).json({
      success: true,
      message: 'Workflow updated successfully!',
      workflow: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET VERSION HISTORY
// GET /api/workflows/:id/versions
// ─────────────────────────────────────────────────────────────────────────────
const getWorkflowVersions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify access (owner or member)
    const accessCheck = await pool.query(
      `SELECT w.id FROM workflows w
       JOIN projects p ON p.id = w.project_id
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
       WHERE w.id = $1 AND (p.user_id = $2 OR pm.user_id = $2)`,
      [id, userId]
    );
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const versions = await pool.query(
      `SELECT wv.*, u.name as saved_by_name
       FROM workflow_versions wv
       LEFT JOIN users u ON u.id = wv.saved_by
       WHERE wv.workflow_id = $1
       ORDER BY wv.version_number DESC`,
      [id]
    );

    return res.status(200).json({
      success: true,
      versions: versions.rows,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTORE A VERSION
// POST /api/workflows/:id/versions/:version/restore
// ─────────────────────────────────────────────────────────────────────────────
const restoreWorkflowVersion = async (req, res, next) => {
  try {
    const { id, version } = req.params;
    const userId = req.user.id;

    // Verify ownership
    const ownershipCheck = await pool.query(
      'SELECT * FROM workflows WHERE id = $1 AND project_id IN (SELECT id FROM projects WHERE user_id = $2)',
      [id, userId]
    );
    if (ownershipCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Workflow not found or access denied.' });
    }

    const current = ownershipCheck.rows[0];

    // Get the target version snapshot
    const snapResult = await pool.query(
      'SELECT * FROM workflow_versions WHERE workflow_id = $1 AND version_number = $2',
      [id, version]
    );
    if (snapResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Version not found.' });
    }

    const snap = snapResult.rows[0];
    const nextVersion = (current.version || 1) + 1;

    // Snapshot current state before restoring
    await pool.query(
      `INSERT INTO workflow_versions 
         (workflow_id, version_number, name, steps, yml_config, platform, saved_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, current.version || 1, current.name, current.steps, current.yml_config, current.platform, userId]
    );

    // Apply the old snapshot as the new current
    const result = await pool.query(
      `UPDATE workflows 
       SET name = $1, steps = $2, yml_config = $3, platform = $4, version = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [snap.name, snap.steps, snap.yml_config, snap.platform, nextVersion, id]
    );

    return res.status(200).json({
      success: true,
      message: `Version restored. Now at v${nextVersion}`,
      workflow: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE VERSION MESSAGE
// PUT /api/workflows/:id/versions/:version/message
// ─────────────────────────────────────────────────────────────────────────────
const updateWorkflowVersionMessage = async (req, res, next) => {
  try {
    const { id, version } = req.params;
    const { commit_message } = req.body;
    const userId = req.user.id;

    // Verify ownership
    const ownershipCheck = await pool.query(
      'SELECT id FROM workflows WHERE id = $1 AND project_id IN (SELECT id FROM projects WHERE user_id = $2)',
      [id, userId]
    );
    if (ownershipCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Workflow not found or access denied.' });
    }

    const result = await pool.query(
      'UPDATE workflow_versions SET commit_message = $1 WHERE workflow_id = $2 AND version_number = $3 RETURNING *',
      [commit_message, id, version]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Version not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Version message updated successfully.',
      version: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createWorkflow,
  getWorkflowsByProject,
  getWorkflowById,
  deleteWorkflow,
  updateWorkflow,
  getWorkflowVersions,
  restoreWorkflowVersion,
  updateWorkflowVersionMessage,
};
