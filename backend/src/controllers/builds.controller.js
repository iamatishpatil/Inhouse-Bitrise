// src/controllers/builds.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Builds Controller — Manages build triggers and history.
// ─────────────────────────────────────────────────────────────────────────────

const { validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { runBuild } = require('../services/buildRunner');
const socketService = require('../services/socket.service');
const { sendBuildCard } = require('../services/teamsNotifier');

// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER BUILD
// POST /api/builds
// Body: { project_id, workflow_id }
// ─────────────────────────────────────────────────────────────────────────────
const triggerBuild = async (req, res, next) => {
  try {
    const { project_id, workflow_id, branch } = req.body;
    const userId = req.user.id;
    // Where the trigger came from. Defaults to a manual UI click; the MCP/AI
    // layer passes 'api'. Anything unrecognised falls back to 'manual'.
    const triggerSource = ['manual', 'webhook', 'api'].includes(req.body.trigger_source)
      ? req.body.trigger_source
      : 'manual';

    // 1. Verify project access — owner OR admin member (viewers cannot trigger builds)
    const projectCheck = await pool.query(
      `SELECT p.id FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
       WHERE p.id = $1 AND (
         p.user_id = $2
         OR (pm.user_id = $2 AND pm.role = 'admin')
       )`,
      [project_id, userId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Only project owners and admins can trigger builds.' });
    }

    // 2. Get next sequential build number for this project
    const buildNumberRes = await pool.query(
      'SELECT GREATEST(COALESCE(MAX(build_number), 0) + 1, 600) as next_number FROM builds WHERE project_id = $1',
      [project_id]
    );
    const buildNumber = buildNumberRes.rows[0].next_number;

    // 3. Get workflow details (for platform)
    const workflowRes = await pool.query('SELECT platform FROM workflows WHERE id = $1', [workflow_id]);
    const platform = workflowRes.rows[0]?.platform || 'android';

    // 4. Calculate estimated duration from historical average
    const avgRes = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (finished_at - started_at))) as avg_duration
       FROM (
         SELECT started_at, finished_at
         FROM builds
         WHERE workflow_id = $1 AND status = 'success' AND started_at IS NOT NULL AND finished_at IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 5
       ) recent_successes`,
      [workflow_id]
    );
    const estimatedDuration = avgRes.rows[0]?.avg_duration ? Math.round(avgRes.rows[0].avg_duration) : 300;

    // 5. Create Build record with 'pending' status
    const result = await pool.query(
      `INSERT INTO builds (project_id, workflow_id, status, branch, build_number, platform, trigger_source, triggered_by, estimated_duration)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [project_id, workflow_id, 'pending', branch || 'main', buildNumber, platform, triggerSource, userId, estimatedDuration]
    );

    const build = result.rows[0];
    socketService.emitStatusChange(build.id, 'pending');

    // Push-notify any listening runner (this process or remote).
    // Runners claim atomically via FOR UPDATE SKIP LOCKED.
    try {
      await pool.query(`NOTIFY new_build, '${build.id}'`);
      console.log(`📣 [API] NOTIFY new_build ${build.id}`);
    } catch (e) {
      console.warn('NOTIFY new_build failed (will be caught by safety poll):', e.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Build triggered successfully!',
      build,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Pagination helper — clamps limit/offset from query params.
// Default page = 25 builds. Hard cap = 100 (never let the client ask for 1M).
// ─────────────────────────────────────────────────────────────────────────────
const parsePaging = (query, { defaultLimit = 25, maxLimit = 100 } = {}) => {
  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = defaultLimit;
  limit = Math.min(limit, maxLimit);

  let offset = parseInt(query.offset, 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  return { limit, offset };
};

// Build list columns — deliberately EXCLUDES the heavy `logs` TEXT column.
// Pulling logs for every build was the dominant cause of slow list loads
// (full stdout/stderr per build × hundreds of builds = multi-MB payloads).
// Logs are fetched lazily per-build via GET /api/builds/:id.
const BUILD_LIST_COLUMNS = `
  b.id, b.project_id, b.workflow_id, b.build_number, b.version, b.branch,
  b.status, b.platform, b.artifact_path, b.testflight_uploaded,
  b.trigger_source, b.commit_sha, b.commit_message, b.commit_author,
  b.current_step, b.total_steps, b.estimated_duration,
  b.started_at, b.finished_at, b.created_at,
  b.triggered_by, tu.name AS trigger_user_name`;

// ─────────────────────────────────────────────────────────────────────────────
// GET BUILDS FOR A PROJECT (paginated)
// GET /api/builds/project/:projectId?limit=25&offset=0
// Access: Owner OR any project member (admin/viewer)
// ─────────────────────────────────────────────────────────────────────────────
const getBuildsByProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;
    const { limit, offset } = parsePaging(req.query);

    const result = await pool.query(
      `SELECT ${BUILD_LIST_COLUMNS},
              w.name AS workflow_name,
              COUNT(*) OVER() AS total_count
       FROM builds b
       LEFT JOIN workflows w ON b.workflow_id = w.id
       JOIN projects p ON b.project_id = p.id
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
       LEFT JOIN users tu ON b.triggered_by = tu.id::text
       WHERE b.project_id = $1 AND (p.user_id = $2 OR pm.user_id = $2)
       ORDER BY b.created_at DESC
       LIMIT $3 OFFSET $4`,
      [projectId, userId, limit, offset]
    );

    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
    const builds = result.rows.map(({ total_count, ...b }) => b);

    return res.status(200).json({
      success: true,
      builds,
      total,
      limit,
      offset,
      hasMore: offset + builds.length < total,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET RECENT BUILDS ACROSS ALL ACCESSIBLE PROJECTS (paginated)
// GET /api/builds/recent?limit=25&offset=0
// Powers the Inhouse-Bitrise-style global "Builds" activity feed (home page).
// Access: builds from any project the user owns OR is a member of.
// ─────────────────────────────────────────────────────────────────────────────
const getRecentBuilds = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { limit, offset } = parsePaging(req.query);

    const result = await pool.query(
      `SELECT ${BUILD_LIST_COLUMNS},
              w.name AS workflow_name,
              p.name AS project_name,
              COUNT(*) OVER() AS total_count
       FROM builds b
       LEFT JOIN workflows w ON b.workflow_id = w.id
       JOIN projects p ON b.project_id = p.id
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
       LEFT JOIN users tu ON b.triggered_by = tu.id::text
       WHERE p.user_id = $1 OR pm.user_id = $1
       ORDER BY b.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
    const builds = result.rows.map(({ total_count, ...b }) => b);

    return res.status(200).json({
      success: true,
      builds,
      total,
      limit,
      offset,
      hasMore: offset + builds.length < total,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE BUILD DETAILS (including logs)
// GET /api/builds/:id
// Access: Owner OR any project member (admin/viewer)
// ─────────────────────────────────────────────────────────────────────────────
const getBuildById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT b.*, p.name as project_name, w.name as workflow_name, tu.name as trigger_user_name
       FROM builds b
       JOIN projects p ON b.project_id = p.id
       LEFT JOIN workflows w ON b.workflow_id = w.id
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
       LEFT JOIN users tu ON b.triggered_by = tu.id::text
       WHERE b.id = $1 AND (p.user_id = $2 OR pm.user_id = $2)`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Build not found.' });
    }

    return res.status(200).json({
      success: true,
      build: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

const abortBuild = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify owner or admin member
    const buildCheck = await pool.query(
      `SELECT b.id FROM builds b 
       JOIN projects p ON b.project_id = p.id
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
       WHERE b.id = $1 AND (
         p.user_id = $2
         OR (pm.user_id = $2 AND pm.role = 'admin')
       )`,
      [id, userId]
    );

    if (buildCheck.rows.length === 0) return res.status(403).json({ success: false, message: 'Unauthorized' });

    // Cancel anytime an in-progress build (queued, running, or deploying). The
    // 'aborted' status keeps user-cancelled builds distinct from real failures.
    const result = await pool.query(
      `UPDATE builds SET status = $1, finished_at = NOW(), logs = COALESCE(logs, '') || '\n🚨 ABORTED: Build stopped by user.\n'
       WHERE id = $2 AND status IN ('pending', 'running', 'pending_deploy', 'deploying', 'pending_testflight', 'deploying_testflight')
       RETURNING id`,
      ['aborted', id]
    );

    if (result.rows.length > 0) {
      socketService.emitStatusChange(id, 'aborted');

      // If a runner is actively building this, kill its process too.
      try {
        await pool.query(`NOTIFY abort_build, '${id}'`);
        console.log(`📣 [API] NOTIFY abort_build ${id}`);
      } catch (e) {
        console.warn('NOTIFY abort_build failed:', e.message);
      }

      return res.status(200).json({ success: true, message: 'Build cancelled' });
    } else {
      return res.status(400).json({ success: false, message: 'Build already finished — nothing to cancel.' });
    }
  } catch (error) {
    next(error);
  }
};

const deployToS3 = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify owner or admin member
    const buildCheck = await pool.query(
      `SELECT b.id FROM builds b 
       JOIN projects p ON b.project_id = p.id
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
       WHERE b.id = $1 AND (
         p.user_id = $2
         OR (pm.user_id = $2 AND pm.role = 'admin')
       )`,
      [id, userId]
    );

    if (buildCheck.rows.length === 0) return res.status(403).json({ success: false, message: 'Unauthorized' });

    // Queue S3 deployment (runner will pick this up asynchronously in the background)
    await pool.query('UPDATE builds SET status = $1 WHERE id = $2', ['pending_deploy', id]);
    try {
      await pool.query(`NOTIFY new_deploy, '${id}'`);
      console.log(`📣 [API] NOTIFY new_deploy ${id}`);
    } catch (e) {
      console.warn('NOTIFY new_deploy failed (will be caught by safety poll):', e.message);
    }

    return res.status(200).json({ success: true, message: 'Deployment triggered! The background runner is now uploading the build to S3.' });
  } catch (err) {
    console.error('S3 Manual Deploy Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const deployToTestFlight = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify owner or admin member
    const buildCheck = await pool.query(
      `SELECT b.id FROM builds b 
       JOIN projects p ON b.project_id = p.id
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
       WHERE b.id = $1 AND (
         p.user_id = $2
         OR (pm.user_id = $2 AND pm.role = 'admin')
       )`,
      [id, userId]
    );

    if (buildCheck.rows.length === 0) return res.status(403).json({ success: false, message: 'Unauthorized' });

    // Queue TestFlight deployment (runner will pick this up asynchronously in the background)
    await pool.query('UPDATE builds SET status = $1 WHERE id = $2', ['pending_testflight', id]);
    socketService.emitStatusChange(id, 'pending_testflight');

    try {
      await pool.query(`NOTIFY new_testflight, '${id}'`);
      console.log(`📣 [API] NOTIFY new_testflight ${id}`);
    } catch (e) {
      console.warn('NOTIFY new_testflight failed (will be caught by safety poll):', e.message);
    }

    return res.status(200).json({ success: true, message: 'TestFlight deployment triggered! The background runner is now uploading the build to TestFlight.' });
  } catch (err) {
    console.error('TestFlight Manual Deploy Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// SHARE BUILD TO MICROSOFT TEAMS
// POST /api/builds/:id/share-teams
// Sends a rich Adaptive Card to the configured Teams channel with build details
// ─────────────────────────────────────────────────────────────────────────────
const shareToTeams = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 1. Fetch build with project and workflow details
    const result = await pool.query(
      `SELECT b.*, p.name as project_name, w.name as workflow_name, w.platform
       FROM builds b
       JOIN projects p ON b.project_id = p.id
       LEFT JOIN workflows w ON b.workflow_id = w.id
       WHERE b.id = $1 AND p.user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Build not found.' });
    }

    const build = result.rows[0];

    // 2. Construct PUBLIC install page URL (no login required)
    const origin = req.get('origin') || req.get('referer');
    let originUrl = null;
    if (origin) {
      try {
        const parsed = new URL(origin);
        originUrl = parsed.origin;
      } catch (e) {
        // Ignore parsing errors
      }
    }

    const fallbackUrl = process.env.NODE_ENV === 'production'
      ? 'http://localhost:5174'
      : 'http://localhost:5173';
    const frontendBaseUrl = originUrl || process.env.FRONTEND_URL || fallbackUrl;
    const buildUrl = `${frontendBaseUrl}/install/${build.id}`;

    // 3. Send to Teams
    const teamsResult = await sendBuildCard({
      buildId: build.id,
      buildNumber: build.build_number || 0,
      projectName: build.project_name,
      workflowName: build.workflow_name,
      platform: build.platform || 'android',
      branch: build.branch || 'main',
      version: build.version || 'N/A',
      status: build.status,
      artifactPath: build.artifact_path,
      buildUrl
    });

    if (teamsResult.success) {
      return res.status(200).json({
        success: true,
        message: 'Build link shared to Teams channel successfully! ✅'
      });
    } else {
      return res.status(500).json({
        success: false,
        message: `Failed to share to Teams: ${teamsResult.reason}`
      });
    }
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD ARTIFACT (manual distributable)
// POST /api/builds/upload?project_id=&version=   (body = raw file bytes)
// Headers: X-File-Name: app.apk
// Lets a user drag-and-drop an .ipa/.apk/.aab to distribute a build that wasn't
// produced by the CI. Stored as a 'success' build (no workflow) so it shows in
// the feed and reuses the install/download page.
// ─────────────────────────────────────────────────────────────────────────────
const PLATFORM_BY_EXT = { '.ipa': 'ios', '.apk': 'android', '.aab': 'android' };

const uploadArtifact = async (req, res, next) => {
  let destination = null;
  try {
    const userId = req.user.id;
    const projectId = req.query.project_id || req.headers['x-project-id'];
    const rawName = (req.query.filename || req.headers['x-file-name'] || '').toString();
    const version = (req.query.version || '').toString().trim() || null;

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'project_id is required.' });
    }

    // 1. Verify the user can publish to this project (owner or admin member)
    const access = await pool.query(
      `SELECT p.id FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
       WHERE p.id = $1 AND (p.user_id = $2 OR (pm.user_id = $2 AND pm.role = 'admin'))`,
      [projectId, userId]
    );
    if (access.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Unauthorized: only project owners and admins can upload builds.' });
    }

    // 2. Validate file type → platform
    const safeBase = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(safeBase).toLowerCase();
    const platform = PLATFORM_BY_EXT[ext];
    if (!platform) {
      return res.status(400).json({ success: false, message: 'Unsupported file type. Upload an .ipa, .apk, or .aab.' });
    }

    // 3. Next sequential build number for this project
    const numRes = await pool.query(
      'SELECT GREATEST(COALESCE(MAX(build_number), 0) + 1, 600) AS n FROM builds WHERE project_id = $1',
      [projectId]
    );
    const buildNumber = numRes.rows[0].n;

    // 4. Stream the raw request body to disk
    const artifactDir = path.join(__dirname, '../../public/artifacts');
    fs.mkdirSync(artifactDir, { recursive: true });
    const storedName = `upload_${buildNumber}_${safeBase}`;
    destination = path.join(artifactDir, storedName);

    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(destination);
      req.on('error', reject);
      ws.on('error', reject);
      ws.on('finish', resolve);
      req.pipe(ws);
    });

    // Guard against empty uploads
    const stat = fs.statSync(destination);
    if (!stat.size) {
      fs.unlinkSync(destination);
      return res.status(400).json({ success: false, message: 'Uploaded file was empty.' });
    }

    // 5. Record it as a finished build (no workflow)
    const insert = await pool.query(
      `INSERT INTO builds
         (project_id, workflow_id, status, branch, build_number, platform,
          trigger_source, triggered_by, artifact_path, version, started_at, finished_at)
       VALUES ($1, NULL, 'success', 'uploaded', $2, $3, 'upload', $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [projectId, buildNumber, platform, userId, `/artifacts/${storedName}`, version]
    );
    const build = insert.rows[0];
    socketService.emitStatusChange(build.id, 'success');

    return res.status(201).json({ success: true, message: 'Artifact uploaded successfully!', build });
  } catch (error) {
    // Best-effort cleanup of a partial file
    if (destination) { try { fs.unlinkSync(destination); } catch (e) { /* ignore */ } }
    next(error);
  }
};

/**
 * STREAM LOG (Internal)
 * Receives a log line from the local runner and broadcasts it to the user.
 */
const streamLog = async (req, res) => {
  const { id } = req.params;
  const { log } = req.body;

  try {
    // 1. Emit live log via Socket.io
    socketService.emitLog(id, log);

    // 2. Append to database (optional but recommended for persistence)
    // In a high-traffic app, we would batch this, but for now we append.
    await pool.query(
      'UPDATE builds SET logs = COALESCE(logs, \'\') || $1 || \'\n\' WHERE id = $2',
      [log, id]
    );

    return res.status(200).send('OK');
  } catch (err) {
    return res.status(500).send(err.message);
  }
};

module.exports = {
  triggerBuild,
  getBuildsByProject,
  getRecentBuilds,
  getBuildById,
  abortBuild,
  deployToS3,
  deployToTestFlight,
  shareToTeams,
  uploadArtifact,
  streamLog
};
