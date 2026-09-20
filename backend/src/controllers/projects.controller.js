// src/controllers/projects.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Projects Controller — Handles project lifecycle (Create, Read, Update, Delete).
// Includes GitHub Repo and PAT validation.
// Includes Auto-Trigger configuration and GitHub Webhook handling.
// ─────────────────────────────────────────────────────────────────────────────

const { validationResult } = require('express-validator');
const axios = require('axios');
const crypto = require('crypto');
const pool = require('../config/db');
const socketService = require('../services/socket.service');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Parse GitHub URL to extract owner and repo name
// Supports: 
//   - https://github.com/owner/repo
//   - https://github.com/owner/repo.git
// ─────────────────────────────────────────────────────────────────────────────
const parseGitHubUrl = (url) => {
  try {
    const cleanedUrl = url.replace(/\.git$/, '').replace(/\/$/, '');
    const parts = cleanedUrl.split('/');
    if (parts.length < 2) return null;
    
    const repo = parts.pop();
    const owner = parts.pop();
    
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch (e) {
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE PROJECT
// POST /api/projects
//
// logic:
//   1. Validate input format
//   2. Parse GitHub URL
//   3. Call GitHub API with PAT to verify access
//   4. Save to DB only if verification passes
// ─────────────────────────────────────────────────────────────────────────────
const createProject = async (req, res, next) => {
  console.log('🚀 [DEBUG] Entering createProject V3');
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, description, repo_url, github_pat } = req.body;
    const userId = req.user.id;

    // 1. Parse URL
    const gitInfo = parseGitHubUrl(repo_url);
    if (!gitInfo) {
      return res.status(400).json({
        success: false,
        message: 'Invalid GitHub URL format. Use: https://github.com/owner/repo'
      });
    }

    const { owner, repo } = gitInfo;

    // 2. Validate with GitHub API
    console.log(`🔍 Validating access to ${owner}/${repo}...`);
    try {
      const githubRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          'Authorization': github_pat ? `token ${github_pat}` : undefined,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Ddeploy-App'
        }
      });

      // If we are here, GitHub returned 200 OK
      console.log('✅ GitHub validation successful!');
      
      // Optional: Store the default branch returned by GitHub
      const defaultBranch = githubRes.data.default_branch || 'main';

      // 3. Save to DB
      const result = await pool.query(
        `INSERT INTO projects (user_id, name, description, repo_url, github_pat)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, name, description, repo_url, github_pat]
      );

      return res.status(201).json({
        success: true,
        message: 'Project verified and created successfully!',
        project: result.rows[0],
        github_info: {
          full_name: githubRes.data.full_name,
          private: githubRes.data.private,
          default_branch: defaultBranch
        }
      });

    } catch (gitError) {
      if (gitError.response) {
        console.error('❌ GitHub API Error Details:', {
          status: gitError.response.status,
          data: gitError.response.data,
          headers: gitError.response.headers['x-github-sso'] ? 'SSO Required' : 'None'
        });
        
        let errorMsg = gitError.response.data?.message || 'Could not access the repository.';
        return res.status(400).json({ success: false, message: `Validation failed: ${errorMsg}` });
      }
      
      console.error('❌ Internal Server Error during project creation:', gitError.message);
      return res.status(500).json({
        success: false,
        message: 'Internal server error: ' + gitError.message
      });
    }
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL PROJECTS
// GET /api/projects
// Returns projects the user owns OR has been added to as a member.
// ─────────────────────────────────────────────────────────────────────────────
const getProjects = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT DISTINCT p.id, p.user_id, p.name, p.description, p.repo_url, p.created_at,
         CASE WHEN p.user_id = $1 THEN 'owner' ELSE pm.role END AS my_role
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
       WHERE p.user_id = $1 OR pm.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      projects: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE PROJECT
// GET /api/projects/:id
// Allows access to project owner OR any invited member.
// ─────────────────────────────────────────────────────────────────────────────
const getProjectById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT p.*,
         CASE WHEN p.user_id = $2 THEN 'owner' ELSE pm.role END AS my_role
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
       WHERE p.id = $1 AND (p.user_id = $2 OR pm.user_id = $2)`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    return res.status(200).json({
      success: true,
      project: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE PROJECT
// DELETE /api/projects/:id
// ─────────────────────────────────────────────────────────────────────────────
const deleteProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      'DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project not found or you do not have permission to delete it.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Project deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET AUTO-TRIGGER CONFIG
// GET /api/projects/:id/auto-trigger
// Returns the current auto-trigger settings for a project.
// Access: Owner or any member.
// ─────────────────────────────────────────────────────────────────────────────
const getAutoTriggerConfig = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT p.id, p.auto_trigger_enabled, p.auto_trigger_branch, p.auto_trigger_workflow_ids, p.webhook_secret
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
       WHERE p.id = $1 AND (p.user_id = $2 OR pm.user_id = $2)`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const project = result.rows[0];
    const webhookUrl = `${process.env.MASTER_URL || req.protocol + '://' + req.get('host')}/api/projects/webhook/${id}`;

    // Workflows the user can choose from for auto-trigger.
    const wfResult = await pool.query(
      'SELECT id, name, platform FROM workflows WHERE project_id = $1 ORDER BY name ASC',
      [id]
    );

    return res.status(200).json({
      success: true,
      autoTrigger: {
        enabled: project.auto_trigger_enabled || false,
        branch: project.auto_trigger_branch || '',
        workflowIds: Array.isArray(project.auto_trigger_workflow_ids)
          ? project.auto_trigger_workflow_ids.filter(Boolean)
          : [],
        availableWorkflows: wfResult.rows,
        webhookUrl,
        webhookSecret: project.webhook_secret || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE AUTO-TRIGGER CONFIG
// PUT /api/projects/:id/auto-trigger
// Body: { enabled: bool, branch: string }
// ─────────────────────────────────────────────────────────────────────────────
const updateAutoTrigger = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { enabled, branch, workflowIds } = req.body;

    // Verify ownership
    const projectCheck = await pool.query(
      'SELECT id, webhook_secret FROM projects WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Validate: branch is required when enabling
    if (enabled && (!branch || !branch.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Branch name is required when enabling auto-trigger.',
      });
    }

    // Validate the selected workflow ids actually belong to this project. An empty
    // selection is allowed and means "use the legacy staging-* default".
    let cleanWorkflowIds = null;
    if (Array.isArray(workflowIds) && workflowIds.length > 0) {
      const wfCheck = await pool.query(
        'SELECT id FROM workflows WHERE project_id = $1 AND id = ANY($2::uuid[])',
        [id, workflowIds]
      );
      cleanWorkflowIds = wfCheck.rows.map((r) => r.id);
    }

    // Generate webhook secret if one doesn't exist yet
    let webhookSecret = projectCheck.rows[0].webhook_secret;
    if (!webhookSecret) {
      webhookSecret = crypto.randomUUID();
    }

    await pool.query(
      `UPDATE projects
       SET auto_trigger_enabled = $1, auto_trigger_branch = $2, auto_trigger_workflow_ids = $3, webhook_secret = $4
       WHERE id = $5`,
      [!!enabled, branch ? branch.trim() : null, cleanWorkflowIds, webhookSecret, id]
    );

    const webhookUrl = `${process.env.MASTER_URL || req.protocol + '://' + req.get('host')}/api/projects/webhook/${id}`;

    console.log(`⚡ Auto-trigger ${enabled ? 'ENABLED' : 'DISABLED'} for project ${id} → branch: ${branch || 'none'}`);

    return res.status(200).json({
      success: true,
      message: enabled
        ? `Auto-trigger enabled for branch "${branch}". Configure the webhook URL in your GitHub repo settings.`
        : 'Auto-trigger disabled.',
      autoTrigger: {
        enabled: !!enabled,
        branch: branch ? branch.trim() : null,
        workflowIds: cleanWorkflowIds || [],
        webhookUrl,
        webhookSecret,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GITHUB WEBHOOK HANDLER
// POST /api/projects/webhook/:id
// Receives push events from GitHub, verifies HMAC signature, and auto-triggers
// builds for all workflows if the pushed branch matches the configured branch.
// ─────────────────────────────────────────────────────────────────────────────
const handleWebhook = async (req, res, next) => {
  try {
    const { id } = req.params;
    console.log(`📡 Webhook received for project ${id}`);

    // 1. Fetch project with auto-trigger config
    const projectResult = await pool.query(
      'SELECT id, user_id, repo_url, auto_trigger_enabled, auto_trigger_branch, auto_trigger_workflow_ids, webhook_secret FROM projects WHERE id = $1',
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const project = projectResult.rows[0];

    // 2. Verify GitHub webhook signature (if secret is configured)
    if (project.webhook_secret) {
      const signature = req.headers['x-hub-signature-256'];
      if (!signature) {
        console.warn(`⚠️ Webhook for project ${id}: Missing X-Hub-Signature-256 header`);
        return res.status(403).json({ success: false, message: 'Missing signature.' });
      }

      // Use raw body for HMAC verification
      const rawBody = req.rawBody || JSON.stringify(req.body);
      const hmac = crypto.createHmac('sha256', project.webhook_secret);
      hmac.update(rawBody);
      const expectedSignature = `sha256=${hmac.digest('hex')}`;

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        console.warn(`⚠️ Webhook for project ${id}: Signature mismatch`);
        return res.status(403).json({ success: false, message: 'Invalid signature.' });
      }
    }

    // 3. Check if auto-trigger is enabled
    if (!project.auto_trigger_enabled) {
      console.log(`ℹ️ Webhook for project ${id}: Auto-trigger is disabled. Ignoring.`);
      return res.status(200).json({
        success: true,
        message: 'Webhook received but auto-trigger is disabled.',
        triggered: false,
      });
    }

    // 4. Check the GitHub event type
    const event = req.headers['x-github-event'];
    if (event && event !== 'push') {
      console.log(`ℹ️ Webhook for project ${id}: Ignoring non-push event "${event}"`);
      return res.status(200).json({
        success: true,
        message: `Ignoring event type: ${event}`,
        triggered: false,
      });
    }

    // 5. Extract the pushed branch and repository from the payload
    const payload = req.body;
    
    // Validate repository match
    const payloadRepoUrl = payload.repository?.html_url || payload.repository?.clone_url || '';
    const payloadFullName = payload.repository?.full_name || '';
    
    // Normalize urls to compare
    const dbRepoUrl = project.repo_url.toLowerCase().replace(/\.git$/, '');
    const normalizedPayloadUrl = payloadRepoUrl.toLowerCase().replace(/\.git$/, '');
    
    let repoMatches = false;
    if (normalizedPayloadUrl && normalizedPayloadUrl === dbRepoUrl) {
      repoMatches = true;
    } else if (payloadFullName && dbRepoUrl.endsWith(payloadFullName.toLowerCase())) {
      repoMatches = true;
    }
    
    if (!repoMatches) {
      console.log(`ℹ️ Webhook for project ${id}: Repository mismatch. DB has "${project.repo_url}", payload came from "${payloadFullName || payloadRepoUrl}". Ignoring.`);
      return res.status(200).json({
        success: true,
        message: 'Repository mismatch. Webhook received for a different repository.',
        triggered: false,
      });
    }

    const ref = payload.ref; // e.g., "refs/heads/release_v1.0.6"
    if (!ref) {
      return res.status(200).json({
        success: true,
        message: 'No ref in payload. Ignoring.',
        triggered: false,
      });
    }

    const pushedBranch = ref.replace('refs/heads/', '');
    console.log(`📡 Webhook for project ${id}: Push to branch "${pushedBranch}"`);

    // 6. Check if the pushed branch matches the configured auto-trigger branch.
    // Exact match (trimmed) — the UI promises "only pushes to this exact branch".
    // A blank config never matches (avoids "match everything").
    const configuredBranch = (project.auto_trigger_branch || '').trim();
    if (!configuredBranch || pushedBranch.trim() !== configuredBranch) {
      console.log(`ℹ️ Branch mismatch: pushed "${pushedBranch}" != configured "${configuredBranch}". Ignoring.`);
      return res.status(200).json({
        success: true,
        message: `Branch "${pushedBranch}" does not match auto-trigger branch "${configuredBranch}".`,
        triggered: false,
      });
    }

    // 7. Determine which workflows to build.
    // Preferred: the per-project explicit selection (auto_trigger_workflow_ids).
    // Fallback (when unset/empty): the legacy "all staging-* workflows" behavior,
    // so projects that never configured a selection keep working. Starts-with
    // match ('staging%') excludes "dev-staging-ios", "prod-*", "pro-*".
    const selectedIds = Array.isArray(project.auto_trigger_workflow_ids)
      ? project.auto_trigger_workflow_ids.filter(Boolean)
      : [];

    let workflowsResult;
    if (selectedIds.length > 0) {
      // Scope to this project so a stale/foreign id can never trigger a build.
      workflowsResult = await pool.query(
        'SELECT id, platform FROM workflows WHERE project_id = $1 AND id = ANY($2::uuid[])',
        [id, selectedIds]
      );
      console.log(`ℹ️ Auto-trigger: building ${workflowsResult.rows.length} selected workflow(s).`);
    } else {
      workflowsResult = await pool.query(
        "SELECT id, platform FROM workflows WHERE project_id = $1 AND name ILIKE 'staging%'",
        [id]
      );
      console.log('ℹ️ Auto-trigger: no selection configured — building staging-* workflows (legacy default).');
    }

    if (workflowsResult.rows.length === 0) {
      console.log(`ℹ️ Webhook for project ${id}: No workflows found. Nothing to trigger.`);
      return res.status(200).json({
        success: true,
        message: 'Branch matched but no workflows configured.',
        triggered: false,
      });
    }

    // Commit metadata from the GitHub push payload (shown in the build UI).
    const headCommit = payload.head_commit || {};
    const commitSha = headCommit.id || null;
    const commitMessage = headCommit.message || null;
    const commitAuthor = headCommit.author?.name || payload.pusher?.name || null;

    // 8. Create a build for each workflow
    const createdBuilds = [];
    for (const workflow of workflowsResult.rows) {
      // Get next build number
      const buildNumberRes = await pool.query(
        'SELECT GREATEST(COALESCE(MAX(build_number), 0) + 1, 600) as next_number FROM builds WHERE project_id = $1',
        [id]
      );
      const buildNumber = buildNumberRes.rows[0].next_number;

      const buildResult = await pool.query(
        `INSERT INTO builds (project_id, workflow_id, status, branch, build_number, platform,
                             trigger_source, commit_sha, commit_message, commit_author)
         VALUES ($1, $2, $3, $4, $5, $6, 'webhook', $7, $8, $9)
         RETURNING id, platform`,
        [id, workflow.id, 'pending', pushedBranch, buildNumber, workflow.platform || 'android',
         commitSha, commitMessage, commitAuthor]
      );

      const newBuild = buildResult.rows[0];
      createdBuilds.push(newBuild);

      socketService.emitStatusChange(newBuild.id, 'pending');

      // Notify the runner
      try {
        await pool.query(`NOTIFY new_build, '${newBuild.id}'`);
        console.log(`📣 [WEBHOOK] NOTIFY new_build ${newBuild.id} (${workflow.platform})`);
      } catch (e) {
        console.warn('NOTIFY new_build failed:', e.message);
      }
    }

    const pusher = payload.pusher?.name || 'unknown';
    console.log(`✅ Auto-triggered ${createdBuilds.length} build(s) for project ${id} by ${pusher}`);

    return res.status(200).json({
      success: true,
      message: `Auto-triggered ${createdBuilds.length} build(s) for branch "${pushedBranch}".`,
      triggered: true,
      builds: createdBuilds,
    });
  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LIST BRANCHES
// GET /api/projects/:id/branches
//
// Returns the project repo's branches (from GitHub, using the stored PAT) so the
// UI can offer a branch dropdown instead of free text. Paginates up to 500.
// ─────────────────────────────────────────────────────────────────────────────
const getBranches = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT p.repo_url, p.github_pat
         FROM projects p
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
        WHERE p.id = $1 AND (p.user_id = $2 OR pm.user_id = $2)`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const { repo_url, github_pat } = result.rows[0];
    const gitInfo = parseGitHubUrl(repo_url || '');
    if (!gitInfo) {
      return res.status(400).json({ success: false, message: 'Invalid repository URL' });
    }

    const headers = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'ddeploy',
    };
    if (github_pat) headers.Authorization = `token ${github_pat}`;

    const branches = [];
    let defaultBranch = 'main';
    try {
      // Repo metadata gives the default branch (so the UI can preselect it).
      const repoRes = await axios.get(
        `https://api.github.com/repos/${gitInfo.owner}/${gitInfo.repo}`,
        { headers, timeout: 10000 }
      );
      defaultBranch = repoRes.data?.default_branch || 'main';

      // GitHub paginates branches at 100/page; pull up to 5 pages (500 branches).
      for (let page = 1; page <= 5; page++) {
        const ghRes = await axios.get(
          `https://api.github.com/repos/${gitInfo.owner}/${gitInfo.repo}/branches`,
          { headers, params: { per_page: 100, page }, timeout: 10000 }
        );
        const names = (ghRes.data || []).map((b) => b.name);
        branches.push(...names);
        if (names.length < 100) break; // last page
      }
    } catch (ghErr) {
      return res.status(502).json({
        success: false,
        message: 'Could not fetch branches from GitHub',
        detail: ghErr.response?.data?.message || ghErr.message,
      });
    }

    return res.status(200).json({
      success: true,
      branches,
      defaultBranch,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  deleteProject,
  handleWebhook,
  getAutoTriggerConfig,
  updateAutoTrigger,
  getBranches
};
