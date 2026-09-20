// src/services/buildRunner.js
// ─────────────────────────────────────────────────────────────────────────────
// Build Runner Service — Robust version with better logging and timeouts.
// ─────────────────────────────────────────────────────────────────────────────

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const simpleGit = require('simple-git');
const yaml = require('js-yaml');
const { Client } = require('pg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const pool = require('../config/db');
const socketService = require('./socket.service');

// Store active build processes for abortion
const activeProcesses = new Map();
let activeJobs = 0;

// Terminal colors for visual division of concurrent builds
const BUILD_COLORS = [
  '\x1b[37m', // White
  '\x1b[32m', // Green
  '\x1b[34m', // Blue
  '\x1b[33m', // Yellow
];
const RESET_COLOR = '\x1b[0m';

// ─────────────────────────────────────────────────────────────────────────────
// Persistent dependency caches.
// A self-hosted runner keeps caches warm across builds (unlike ephemeral cloud
// CI), so we point each toolchain at a stable shared cache dir. This makes
// `flutter pub get`, `pod install`, and Gradle dependency resolution near-instant
// on a warm cache. The runner can now process multiple builds (activeJobs);
// PUB_CACHE/CP_HOME_DIR are safe to share (versioned, read-mostly), but
// GRADLE_USER_HOME is scoped per project below. Override the base with DDEPLOY_CACHE_DIR.
// ─────────────────────────────────────────────────────────────────────────────
const getCacheEnv = (projectId) => {
  const base = process.env.DDEPLOY_CACHE_DIR || path.join(process.env.HOME || '/tmp', '.ddeploy_cache');
  // GRADLE_USER_HOME is scoped per project (not shared like PUB_CACHE/CP_HOME_DIR):
  // Gradle's build-cache/transforms-cache hold mutable, concurrently-written compiled
  // outputs, so one corrupted or SIGKILL-interrupted entry under a shared dir can break
  // every other project's Android build, not just the one that got interrupted.
  const gradleHome = path.join(base, 'gradle', projectId ? `project_${projectId}` : 'shared');
  const env = {
    PUB_CACHE: path.join(base, 'pub'),   // Flutter / Dart packages
    GRADLE_USER_HOME: gradleHome,        // Android / Gradle deps
    CP_HOME_DIR: path.join(base, 'cocoapods'), // CocoaPods spec repo + cache
  };
  for (const dir of Object.values(env)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* best effort */ }
  }
  return env;
};

const RUNNER_ID = `${require('os').hostname()}-${process.pid}`;

// ─────────────────────────────────────────────────────────────────────────────
// Disk hygiene — bound the unbounded growth of build workspaces and artifacts.
// The runner reuses a per-project workspace by default, but when
// DDEPLOY_REUSE_WORKSPACE=false each build clones into its own <buildId> folder,
// and previously NOTHING ever removed them — every build left behind a multi-GB
// checkout (Pods/DerivedData/build), slowly filling the host disk. Harvested
// APKs/IPAs in public/artifacts/ accumulated forever too. We keep the N most
// recent of each (by mtime) and delete the rest. Per-project reuse workspaces
// (project_*) are left untouched — they are bounded (one per project) and are
// the warm incremental-build caches. Tune with DDEPLOY_KEEP_WORKSPACES /
// DDEPLOY_KEEP_ARTIFACTS.
// ─────────────────────────────────────────────────────────────────────────────
const pruneDir = (dir, keep, { onlyDirs = false, label = '' } = {}) => {
  try {
    if (!fs.existsSync(dir)) return;
    let entries = fs.readdirSync(dir, { withFileTypes: true });
    if (onlyDirs) {
      // Skip the per-project reuse workspaces (project_*) — bounded & still in use.
      entries = entries.filter(e => e.isDirectory() && !e.name.startsWith('project_'));
    } else {
      entries = entries.filter(e => e.isFile());
    }
    const withTime = entries
      .map(e => {
        const full = path.join(dir, e.name);
        let mtime = 0;
        try { mtime = fs.statSync(full).mtimeMs; } catch (_) {}
        return { full, name: e.name, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime); // newest first

    for (const item of withTime.slice(keep)) {
      try {
        fs.rmSync(item.full, { recursive: true, force: true });
        console.log(`🧹 [${RUNNER_ID}] Pruned stale ${label}: ${item.name}`);
      } catch (e) {
        console.error(`⚠️  Failed to prune ${item.full}: ${e.message}`);
      }
    }
  } catch (e) {
    console.error(`⚠️  pruneDir(${dir}) failed: ${e.message}`);
  }
};

const pruneDisk = () => {
  const keepWs = parseInt(process.env.DDEPLOY_KEEP_WORKSPACES, 10);
  const keepArt = parseInt(process.env.DDEPLOY_KEEP_ARTIFACTS, 10);
  const workspaceBase = path.join(process.env.HOME || '/tmp', '.ddeploy_workspaces');
  const artifactDir = path.join(__dirname, '../../public/artifacts');
  pruneDir(workspaceBase, Number.isFinite(keepWs) ? keepWs : 5, { onlyDirs: true, label: 'workspace' });
  pruneDir(artifactDir, Number.isFinite(keepArt) ? keepArt : 30, { label: 'artifact' });
};

const sha256File = (filePath) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  fs.createReadStream(filePath)
    .on('error', reject)
    .on('data', (chunk) => hash.update(chunk))
    .on('end', () => resolve(hash.digest('hex')));
});

/**
 * Upload a harvested artifact to the central API server, which is what actually
 * serves it to devices — the copy sitting on this runner is never downloaded.
 *
 * Sends Content-Length and a sha256 so the receiver can reject a truncated
 * transfer rather than publishing a corrupt APK. That failure mode is quiet and
 * nasty: a half-transferred APK downloads "successfully" on the phone and only
 * fails at install time with "There was a problem while parsing the package".
 * Retried because this runner→API link is the same one that already needed
 * per-step retries for transient timeouts, and these uploads are ~100 MB.
 *
 * Returns true only when the server confirms it stored a verified artifact.
 */
async function uploadArtifactToMaster(filePath, fileName, buildId, logAndEmit) {
  const axios = require('axios');
  const attempts = 3;

  let size;
  let sha256;
  try {
    size = fs.statSync(filePath).size;
    sha256 = await sha256File(filePath);
  } catch (e) {
    logAndEmit(`⚠️ Could not read artifact for upload: ${e.message}`);
    return false;
  }

  const sizeMb = (size / (1024 * 1024)).toFixed(1);

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      logAndEmit(`📤 Uploading ${fileName} (${sizeMb} MB) to central server${attempt > 1 ? ` — attempt ${attempt}/${attempts}` : ''}...`);
      const response = await axios.post(
        `${process.env.MASTER_URL}/api/public/builds/${buildId}/upload`,
        fs.createReadStream(filePath),
        {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': size,
            'X-File-Name': fileName,
            'X-File-Sha256': sha256
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      if (response.data && response.data.success === false) {
        throw new Error(response.data.message || 'Server rejected the artifact');
      }

      logAndEmit(`✅ Artifact verified on central server (${size} bytes, sha256 ${sha256.slice(0, 12)}…).`);
      return true;
    } catch (uploadErr) {
      const detail = (uploadErr.response && uploadErr.response.data && uploadErr.response.data.message) || uploadErr.message;
      logAndEmit(`⚠️ Upload attempt ${attempt}/${attempts} failed: ${detail}`);
    }
  }

  return false;
}

/**
 * Atomically claim the oldest pending build. Returns its id or null.
 * `FOR UPDATE SKIP LOCKED` makes this safe across many parallel runners.
 */
const claimNextPendingBuild = async () => {
  const res = await pool.query(`
    UPDATE builds SET status = 'running', started_at = NOW()
    WHERE id = (
      SELECT id FROM builds
      WHERE status = 'pending'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `);
  return res.rows[0]?.id || null;
};

const claimNextPendingDeploy = async () => {
  const res = await pool.query(`
    UPDATE builds SET status = 'deploying'
    WHERE id = (
      SELECT id FROM builds
      WHERE status = 'pending_deploy'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `);
  return res.rows[0]?.id || null;
};

const claimNextPendingTestFlight = async () => {
  const res = await pool.query(`
    UPDATE builds SET status = 'deploying_testflight'
    WHERE id = (
      SELECT id FROM builds
      WHERE status = 'pending_testflight'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `);
  return res.rows[0]?.id || null;
};

const tryProcess = async () => {
  const capacity = parseInt(process.env.RUNNER_CAPACITY || 4, 10);
  if (activeJobs >= capacity) return;
  
  activeJobs++;
  let claimedWork = false;
  try {
    const buildId = await claimNextPendingBuild();
    if (buildId) {
      console.log(`🎯 [${RUNNER_ID}] Claimed build ${buildId}`);
      claimedWork = true;
      await runBuild(buildId);
      return;
    }
    const deployId = await claimNextPendingDeploy();
    if (deployId) {
      console.log(`🚀 [${RUNNER_ID}] Claimed deploy ${deployId}`);
      claimedWork = true;
      await deployToS3(deployId);
      return;
    }
    const tfId = await claimNextPendingTestFlight();
    if (tfId) {
      console.log(`✈️ [${RUNNER_ID}] Claimed TestFlight upload ${tfId}`);
      claimedWork = true;
      await deployToTestFlight(tfId);
    }
  } catch (err) {
    console.error('❌ Runner error:', err.message);
  } finally {
    activeJobs--;
    // Only prune if we actually did work, to avoid noisy logs on empty polls
    if (claimedWork) pruneDisk();
    
    // If we just finished a job, there might be more pending work in the queue.
    if (claimedWork && activeJobs < capacity) {
      setTimeout(tryProcess, 500);
    }
  }
};

/**
 * START RUNNER — push-based via Postgres LISTEN/NOTIFY, with a slow safety poll.
 */
const startRunner = async () => {
  console.log(`👷 Runner [${RUNNER_ID}] starting in PUSH mode (LISTEN/NOTIFY)`);

  // Clean up any builds left stuck in 'running' state due to server restart/crash
  try {
    const cleanRes = await pool.query(`
      UPDATE builds SET status = 'failed', finished_at = NOW(), logs = COALESCE(logs, '') || '\\n🚨 INTERRUPTED: Build runner restarted and marked this unfinished build as failed.\\n'
      WHERE status = 'running'
    `);
    if (cleanRes.rowCount > 0) {
      console.log(`🧹 [${RUNNER_ID}] Cleaned up ${cleanRes.rowCount} stuck 'running' builds.`);
    }
  } catch (err) {
    console.error('❌ Failed to clean up stuck builds:', err.message);
  }

  // Ensure runner_status table exists and start heartbeat
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS runner_status (id INT PRIMARY KEY, last_heartbeat TIMESTAMP DEFAULT NOW())');
    setInterval(async () => {
      try {
        await pool.query(`
          INSERT INTO runner_status (id, last_heartbeat) VALUES (1, NOW())
          ON CONFLICT (id) DO UPDATE SET last_heartbeat = NOW()
        `);
      } catch (e) {
        // Silent fail for heartbeat
      }
    }, 10000);
  } catch (err) {
    console.error('❌ Failed to initialize runner heartbeat:', err.message);
  }

  // Reclaim disk from previous runs before we start taking new work.
  pruneDisk();

  // Drain anything already queued before the runner started.
  await tryProcess();

  // Dedicated client for LISTEN (cannot share a pooled connection).
  let listener = null;
  let reconnectTimeout = null;

  const connectListener = async () => {
    // Clear any existing reconnect timeout to prevent multiple loops
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    try {
      if (listener) {
        listener.removeAllListeners();
        try {
          await listener.end();
        } catch (e) {}
        listener = null;
      }

      listener = new Client({
        connectionString: process.env.DATABASE_URL,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
      });

      listener.on('notification', (msg) => {
        console.log(`🔔 [${RUNNER_ID}] Notification: ${msg.channel} → ${msg.payload}`);
        if (msg.channel === 'abort_build') {
          const childProcess = activeProcesses.get(msg.payload);
          if (childProcess) {
            console.log(`🛑 [${RUNNER_ID}] Aborting build process ${msg.payload}`);
            try {
              process.kill(-childProcess.pid, 'SIGKILL');
            } catch (e) {
              childProcess.kill('SIGKILL');
            }
            activeProcesses.delete(msg.payload);
          }
        } else {
          tryProcess();
        }
      });

      listener.on('error', (err) => {
        console.error('❌ LISTEN client error:', err.message);
      });

      listener.on('end', () => {
        console.warn('⚠️  LISTEN client ended, reconnecting…');
        if (!reconnectTimeout) {
          reconnectTimeout = setTimeout(connectListener, 5000);
        }
      });

      await listener.connect();
      await listener.query('LISTEN new_build');
      await listener.query('LISTEN new_deploy');
      await listener.query('LISTEN new_testflight');
      await listener.query('LISTEN abort_build');
      console.log(`📡 [${RUNNER_ID}] Subscribed to new_build / new_deploy / new_testflight / abort_build`);
    } catch (err) {
      console.error('❌ LISTEN connect failed, retrying in 5s:', err.message);
      
      if (listener) {
        listener.removeAllListeners();
        try {
          await listener.end();
        } catch (e) {}
        listener = null;
      }

      if (!reconnectTimeout) {
        reconnectTimeout = setTimeout(connectListener, 5000);
      }
    }
  };

  await connectListener();

  // Safety poll — catches missed NOTIFYs (e.g. inserts during a reconnect)
  setInterval(tryProcess, 60_000);
};

const runBuild = async (buildId) => {
  let fullLogs = '';

  try {
    console.log(`[BUILD ${buildId}] 🚀 runBuild entered`);

    // 1. Fetch Build, Project, and Workflow details
    const buildData = await pool.query(
      `SELECT b.*, p.repo_url, p.github_pat, w.steps, w.name as workflow_name, w.yml_config
       FROM builds b
       JOIN projects p ON b.project_id = p.id
       JOIN workflows w ON b.workflow_id = w.id
       WHERE b.id = $1`,
      [buildId]
    );

    if (buildData.rows.length === 0) {
      console.error(`[BUILD ${buildId}] ❌ Build not found in DB`);
      return;
    }
    const build = buildData.rows[0];

    // 2. Update Status to 'running'
    await pool.query('UPDATE builds SET status = $1, started_at = NOW() WHERE id = $2', ['running', buildId]);
    socketService.emitStatusChange(buildId, 'running');

    // 3. Setup Workspace directory where builds will be cloned and executed
    // Use home directory to avoid OneDrive cloud sync extended attributes (com.apple.fileprovider.fpfs)
    // which cause iOS build signing failure: "resource fork, Finder information, or similar detritus not allowed"
    //
    // Workspace is keyed by PROJECT and WORKFLOW so that different environments
    // (like "Android Staging" vs "iOS Prod") get their own isolated, persistent
    // workspace folders and never collide when running concurrently.
    const WORKSPACE_BASE = path.join(process.env.HOME || '/tmp', '.ddeploy_workspaces');
    const REUSE_WORKSPACE = process.env.DDEPLOY_REUSE_WORKSPACE !== 'false'; // default ON
    const workspaceDir = REUSE_WORKSPACE
      ? path.join(WORKSPACE_BASE, `project_${build.project_id}_wf_${build.workflow_id || 'default'}`)
      : path.join(WORKSPACE_BASE, buildId);
    console.log(`[BUILD ${buildId}] 📂 Workspace Path: ${workspaceDir} (reuse=${REUSE_WORKSPACE})`);

    const cacheEnv = getCacheEnv(build.project_id);
    fs.mkdirSync(WORKSPACE_BASE, { recursive: true });

    // 4. Fetch Project Secrets
    const secretsResult = await pool.query(
      'SELECT key, value FROM project_secrets WHERE project_id = $1',
      [build.project_id]
    );
    const secretsEnv = {};
    secretsResult.rows.forEach(s => {
      secretsEnv[s.key] = s.value;
    });

    // Calculate a consistent color for this build based on its UUID
    const colorIndex = parseInt(buildId.replace(/-/g, '').substring(0, 8), 16) % BUILD_COLORS.length;
    const terminalColor = BUILD_COLORS[colorIndex];

    const logAndEmit = (text) => {
      const line = `[${new Date().toLocaleTimeString()}] ${text}`;
      fullLogs += line + '\n';
      
      // Color-code ONLY the backend terminal output, leave front-end raw
      console.log(`${terminalColor}[BUILD ${buildId.slice(0, 8)}] ${text}${RESET_COLOR}`);

      // Emit to local socket
      socketService.emitLog(buildId, text);

      // Forward to Cloud Backend if configured
      if (process.env.RUNNER_ENABLED === 'true' && process.env.MASTER_URL) {
        const axios = require('axios');
        axios.post(`${process.env.MASTER_URL}/api/builds/${buildId}/log`, { log: text })
          .catch(err => { }); // Silent fail for log forwarding
      }
    };

    logAndEmit(`🚀 Starting build: ${build.id.slice(0, 8)}`);
    logAndEmit(`🌿 Branch: ${build.branch || 'main'}`);

    // 4. Get the repository into the workspace.
    // Ensure the per-project workspace dir exists BEFORE constructing the git
    // instance: simple-git v3 validates baseDir eagerly and throws "Cannot use
    // simple-git on a directory that does not exist" if it's missing (e.g. a
    // project's first build, or after the workspace pruner removed a stale one).
    // The cold-clone path below safely rm+recreates it; the warm path needs it.
    fs.mkdirSync(workspaceDir, { recursive: true });
    const git = simpleGit(workspaceDir);
    let cloneUrl = build.repo_url;
    if (build.github_pat) {
      cloneUrl = build.repo_url.replace('https://', `https://${build.github_pat}@`);
    }
    const targetBranch = build.branch || 'main';

    try {
      const hasGitDir = fs.existsSync(path.join(workspaceDir, '.git'));
      let updatedInPlace = false;

      // Warm path: update the existing checkout in place. `git clean -fd` (note:
      // NO -x) removes stray untracked files but KEEPS git-ignored build
      // artifacts (build/, .dart_tool/, ios/Pods/) so the next build is incremental.
      if (REUSE_WORKSPACE && hasGitDir) {
        try {
          logAndEmit(`♻️ Reusing cached workspace (incremental build)...`);
          await git.raw(['remote', 'set-url', 'origin', cloneUrl]);
          // Fetch the target branch and reset to FETCH_HEAD. Using FETCH_HEAD
          // (rather than origin/<branch>) is robust even when the original clone
          // was --single-branch and this build targets a different branch.
          await git.fetch('origin', targetBranch);
          await git.raw(['checkout', '-f', '-B', targetBranch, 'FETCH_HEAD']);
          await git.raw(['reset', '--hard', 'FETCH_HEAD']);
          await git.raw(['clean', '-fd']);
          updatedInPlace = true;
          logAndEmit(`✅ Updated cached workspace to "${targetBranch}".`);
        } catch (reuseErr) {
          logAndEmit(`⚠️ Could not reuse workspace (${reuseErr.message}); doing a clean clone.`);
        }
      }

      // Cold path: fresh clone (first build for this project, reuse disabled, or
      // the warm update failed).
      if (!updatedInPlace) {
        logAndEmit(`📂 Cloning repository...`);
        if (fs.existsSync(workspaceDir)) {
          fs.rmSync(workspaceDir, { recursive: true, force: true });
        }
        fs.mkdirSync(workspaceDir, { recursive: true });
        await git.clone(cloneUrl, '.', ['-b', targetBranch, '--single-branch']);
        logAndEmit(`✅ Cloned branch "${targetBranch}" successfully.`);
      }

      // --- Capture commit metadata (the actual built commit) ---
      try {
        const logSummary = await git.log({ maxCount: 1 });
        const latest = logSummary.latest;
        if (latest) {
          await pool.query(
            'UPDATE builds SET commit_sha = $1, commit_author = $2, commit_message = $3 WHERE id = $4',
            [latest.hash, latest.author_name, latest.message, buildId]
          );
          logAndEmit(`🔖 Commit ${String(latest.hash).slice(0, 7)} — ${latest.message}`);
        }
      } catch (commitErr) {
        logAndEmit(`⚠️ Warning: Could not read commit info: ${commitErr.message}`);
      }

      // --- Extract Version ---
      try {
        const pubspecPath = path.join(workspaceDir, 'pubspec.yaml');
        if (fs.existsSync(pubspecPath)) {
          const content = fs.readFileSync(pubspecPath, 'utf8');
          const versionMatch = content.match(/^version:\s*(.+)$/m);
          if (versionMatch) {
            let version = versionMatch[1].trim();
            // Format version to look like Ddeploy (e.g., v1.0.4)
            const cleanVersion = version.split('+')[0];
            const formattedVersion = `v${cleanVersion}`;

            await pool.query('UPDATE builds SET version = $1 WHERE id = $2', [formattedVersion, buildId]);
            logAndEmit(`🏷️ Detected Version: ${formattedVersion}`);
          }
        }
      } catch (verErr) {
        logAndEmit(`⚠️ Warning: Could not extract version: ${verErr.message}`);
      }
    } catch (gitError) {
      logAndEmit(`❌ Git Clone Failed: ${gitError.message}`);
      throw new Error('Clone Failed');
    }

    // 5. Determine Steps (Manual vs YAML)
    let steps = build.steps || [];
    if (build.yml_config) {
      logAndEmit(`📄 Parsing YAML configuration...`);
      try {
        const doc = yaml.load(build.yml_config);
        const workflowName = build.workflow_name;
        if (doc.workflows && doc.workflows[workflowName]) {
          const rawSteps = doc.workflows[workflowName].steps || [];
          steps = rawSteps.map(s => {
            const stepType = Object.keys(s)[0];
            const config = s[stepType];
            const inputs = config.inputs || [];

            if (stepType.startsWith('script')) {
              const content = Array.isArray(inputs) ? inputs.find(i => i.content)?.content : inputs.content;
              return { name: config.title || 'Script', command: content || 'echo "Empty Script"' };
            } else if (stepType.startsWith('flutter-installer')) {
              return { name: 'Flutter Check', command: 'flutter --version' };
            } else if (stepType.startsWith('flutter-build')) {
              let platform = Array.isArray(inputs) ? inputs.find(i => i.platform)?.platform : inputs.platform;
              // Map 'android' to 'apk' for Flutter CLI compatibility
              if (platform === 'android') platform = 'apk';

              const params = Array.isArray(inputs) ? inputs.find(i => i.android_additional_params)?.android_additional_params : inputs.android_additional_params;
              return { name: 'Flutter Build', command: `flutter clean && flutter pub get && flutter build ${platform || 'apk'} ${params || ''}` };
            } else if (stepType.startsWith('amazon-s3-deploy')) {
              const bucket = Array.isArray(inputs) ? inputs.find(i => i.bucket_name)?.bucket_name : inputs.bucket_name;
              const region = Array.isArray(inputs) ? inputs.find(i => i.region)?.region : inputs.region;
              return { name: 'S3 Deploy', type: 's3', bucket, region };
            }
            return { name: stepType, command: `echo "Skipping step: ${stepType}"` };
          });
          logAndEmit(`✅ Successfully parsed ${steps.length} steps from YAML.`);
        } else {
          throw new Error(`Workflow "${workflowName}" not found in YAML.`);
        }
      } catch (ymlError) {
        logAndEmit(`❌ YAML Error: ${ymlError.message}`);
        throw ymlError;
      }
    }

    // 6. Setup Mock Envman
    const envmanPath = path.join(workspaceDir, 'envman');
    fs.writeFileSync(envmanPath, '#!/bin/bash\necho "[envman] $@"');
    fs.chmodSync(envmanPath, '755');

    // Record total step count so the UI can render a progress bar.
    await pool.query(
      'UPDATE builds SET total_steps = $1, current_step = 0 WHERE id = $2',
      [steps.length, buildId]
    ).catch(() => {});

    // Clean old artifacts from the workspace to prevent cross-contamination between builds.
    try {
      const oldIpaPath = path.join(workspaceDir, 'ios/Runner.ipa');
      if (fs.existsSync(oldIpaPath)) fs.rmSync(oldIpaPath);
      
      const apkDir = path.join(workspaceDir, 'build/app/outputs/flutter-apk');
      if (fs.existsSync(apkDir)) {
        const oldApks = fs.readdirSync(apkDir).filter(f => f.endsWith('.apk'));
        for (const apk of oldApks) {
          fs.rmSync(path.join(apkDir, apk));
        }
      }
    } catch (cleanErr) {
      logAndEmit(`⚠️ Warning: Could not clean old artifacts: ${cleanErr.message}`);
    }

    // 7. Execute Steps
    let stepIndex = 0;
    for (const step of steps) {
      stepIndex++;
      await pool.query('UPDATE builds SET current_step = $1 WHERE id = $2', [stepIndex, buildId]).catch(() => {});
      logAndEmit(`\n▶️ Starting Step: ${step.name}`);

      let success = false;
      let attempts = 0;
      const maxAttempts = 3;

      while (!success && attempts < maxAttempts) {
        attempts++;
        if (attempts > 1) {
          logAndEmit(`\n⚠️ Retrying step "${step.name}" (Attempt ${attempts} of ${maxAttempts}) due to failure...`);
        }

        const stepStartTime = Date.now();

        if (step.type === 's3') {
          success = await handleS3Deploy(step, workspaceDir, secretsEnv, logAndEmit, buildId);
        } else {
          success = await new Promise((resolve) => {
            const cleanEnv = { ...process.env };
            Object.keys(cleanEnv).forEach(k => {
              if (k.startsWith('VSCODE_') || k.startsWith('GIT_ASKPASS') || k.startsWith('ANTIGRAVITY_')) {
                delete cleanEnv[k];
              }
            });

            const child = spawn('sh', ['-c', step.command], {
              cwd: workspaceDir,
              env: {
                ...cleanEnv,
                ...cacheEnv,
                ...secretsEnv,
                GIT_TERMINAL_PROMPT: '0',
                PATH: `${workspaceDir}:${process.env.PATH}`,
                DDEPLOY_BUILD_NUMBER: build.id.slice(0, 4),
                DDEPLOY_SOURCE_DIR: workspaceDir,
                INHOUSE_BITRISE_SOURCE_DIR: workspaceDir,
                BUILD_NUMBER: build.build_number || build.id.slice(0, 4)
              },
              detached: true // Place in new process group to kill whole tree
            });

            activeProcesses.set(buildId, child);

            // 45-minute timeout per step (Crucial for large IPA uploads to TestFlight)
            const timer = setTimeout(() => {
              try {
                process.kill(-child.pid, 'SIGKILL');
              } catch(e) {
                child.kill('SIGKILL');
              }
              logAndEmit(`🚨 TIMEOUT: Step "${step.name}" exceeded 45 minutes.`);
              resolve(false);
            }, 2700000); // 45 minutes in milliseconds

            child.stdout.on('data', (data) => logAndEmit(data.toString()));
            child.stderr.on('data', (data) => {
              const err = data.toString();
              if (err.trim()) logAndEmit(`⚠️ ${err}`);
            });

            child.on('error', (err) => {
              logAndEmit(`❌ Process Error: ${err.message}`);
              resolve(false);
            });

            child.on('close', (code) => {
              clearTimeout(timer);
              activeProcesses.delete(buildId);
              if (code === 0) {
                logAndEmit(`✅ Step "${step.name}" finished.`);
                resolve(true);
              } else {
                logAndEmit(`❌ Step "${step.name}" failed (Code ${code}).`);
                resolve(false);
              }
            });
          });
        }

        const stepDurationMs = Date.now() - stepStartTime;
        if (!success && stepDurationMs > 300000) {
          // If the step failed but took longer than 5 minutes, it's likely a real compile error, not a network drop.
          logAndEmit(`⚠️ Step failed after long duration (${Math.round(stepDurationMs / 1000)}s), skipping retries.`);
          break;
        }
      }

      if (!success) throw new Error(`Build stopped at step: ${step.name}`);
    }

    logAndEmit(`\n🎉 BUILD SUCCESSFUL!`);

    // --- Artifact Harvesting ---
    let artifactPath = null;
    try {
      logAndEmit(`📦 Searching for artifacts...`);
      const buildDir = path.join(workspaceDir, 'build/app/outputs/flutter-apk');
      if (fs.existsSync(buildDir)) {
        const files = fs.readdirSync(buildDir).filter(f => f.endsWith('.apk'));
        if (files.length > 0) {
          // Prefer flavored release APKs, then standard release
          const bestApk = files.find(f => f.includes('release')) || files[0];
          const artifactDir = path.join(__dirname, '../../public/artifacts');
          if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });

          const newFileName = `build_${build.build_number}_${bestApk}`;
          const destination = path.join(artifactDir, newFileName);
          fs.copyFileSync(path.join(buildDir, bestApk), destination);

          artifactPath = `/artifacts/${newFileName}`;
          logAndEmit(`✅ Artifact saved: ${bestApk}`);

          // Stream Android APK to central API server if MASTER_URL is configured
          if (process.env.MASTER_URL) {
            const uploaded = await uploadArtifactToMaster(destination, newFileName, buildId, logAndEmit);
            if (!uploaded) {
              logAndEmit(`⚠️ Warning: the APK is on this runner but NOT on the central server — its download link will fail until this build is re-run.`);
            }
          }
        }
      }

      // Harvest iOS IPA if it exists
      const ipaPath = path.join(workspaceDir, 'ios/Runner.ipa');
      if (fs.existsSync(ipaPath)) {
        const artifactDir = path.join(__dirname, '../../public/artifacts');
        if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });

        const newFileName = `build_${build.build_number}_Runner.ipa`;
        const destination = path.join(artifactDir, newFileName);
        fs.copyFileSync(ipaPath, destination);

        artifactPath = `/artifacts/${newFileName}`;
        logAndEmit(`✅ Artifact saved: Runner.ipa`);
      }
    } catch (artErr) {
      logAndEmit(`⚠️ Warning: Could not harvest artifact: ${artErr.message}`);
    }

    // Upload iOS dSYMs (+ Dart symbols) to Sentry so native crash frames
    // symbolicate — without this, App Hangs show <redacted>. Non-fatal.
    await uploadDsymsToSentry(workspaceDir, secretsEnv, logAndEmit);

    // Extract final bumped version from pubspec.yaml to update DB
    try {
      const pubspecPath = path.join(workspaceDir, 'pubspec.yaml');
      if (fs.existsSync(pubspecPath)) {
        const content = fs.readFileSync(pubspecPath, 'utf8');
        const versionMatch = content.match(/^version:\s*(.+)$/m);
        if (versionMatch) {
          let version = versionMatch[1].trim();
          const cleanVersion = version.split('+')[0];
          const formattedVersion = `v${cleanVersion}`;
          await pool.query('UPDATE builds SET version = $1 WHERE id = $2', [formattedVersion, buildId]);
          logAndEmit(`🏷️ Updated Final Version in DB: ${formattedVersion}`);
        }
      }
    } catch (verErr) {
      logAndEmit(`⚠️ Warning: Could not update final version in DB: ${verErr.message}`);
    }

    await pool.query(
      'UPDATE builds SET status = $1, finished_at = NOW(), logs = $2, artifact_path = $3, current_step = total_steps WHERE id = $4',
      ['success', fullLogs, artifactPath, buildId]
    );
    socketService.emitStatusChange(buildId, 'success');


  } catch (error) {
    console.error(`[BUILD ${buildId}] 🚨 FAILED:`, error);
    const finalLogs = fullLogs + `\n🚨 FAILED: ${error.message}\n`;
    // Guard on status='running': if the API already flipped this to 'aborted'
    // (user cancelled, which SIGKILLed the process and landed us here), don't
    // clobber the cancellation back to 'failed'.
    const upd = await pool.query(
      "UPDATE builds SET status = 'failed', finished_at = NOW(), logs = $1 WHERE id = $2 AND status = 'running' RETURNING id",
      [finalLogs, buildId]
    );
    if (upd.rowCount > 0) socketService.emitStatusChange(buildId, 'failed');
    else console.log(`[BUILD ${buildId}] ⏹️ Not marking failed (status changed externally, likely cancelled).`);
  }
};

// Uploads iOS dSYMs + Dart split-debug-info to Sentry so crash frames
// symbolicate (the <redacted> App Hangs). Requires SENTRY_AUTH_TOKEN in the
// project's secrets. Fully non-fatal: skips on missing token / non-iOS build,
// and never throws into the build flow.
const uploadDsymsToSentry = (workspaceDir, secretsEnv, logAndEmit) => {
  return new Promise((resolve) => {
    try {
      const token = secretsEnv.SENTRY_AUTH_TOKEN;
      if (!token) {
        logAndEmit('⏭️ SENTRY_AUTH_TOKEN not in project secrets — skipping Sentry dSYM upload.');
        return resolve();
      }
      const iosBuildDir = path.join(workspaceDir, 'build/ios');
      if (!fs.existsSync(iosBuildDir)) {
        logAndEmit('ℹ️ No build/ios output — not an iOS build, skipping dSYM upload.');
        return resolve();
      }
      const dartSymbols = path.join(workspaceDir, 'build/symbols');
      const org = secretsEnv.SENTRY_ORG || 'future-jb';
      const project = secretsEnv.SENTRY_PROJECT || 'flutter';
      const url = secretsEnv.SENTRY_URL || 'https://de.sentry.io';

      logAndEmit('⬆️ Uploading iOS dSYMs to Sentry…');
      const script = [
        'set +e',
        'if ! command -v sentry-cli >/dev/null 2>&1; then',
        '  curl -sL https://sentry.io/get-cli/ | bash || npm i -g @sentry/cli || { echo "sentry-cli unavailable (non-fatal)"; exit 0; }',
        'fi',
        `sentry-cli debug-files upload --include-sources "${iosBuildDir}" || echo "dSYM upload returned non-zero (non-fatal)"`,
        `if [ -d "${dartSymbols}" ]; then sentry-cli debug-files upload "${dartSymbols}" || true; fi`,
      ].join('\n');

      const child = spawn('sh', ['-c', script], {
        cwd: workspaceDir,
        env: {
          ...process.env,
          ...secretsEnv,
          SENTRY_AUTH_TOKEN: token,
          SENTRY_URL: url,
          SENTRY_ORG: org,
          SENTRY_PROJECT: project,
        },
      });
      child.stdout.on('data', (d) => logAndEmit(d.toString()));
      child.stderr.on('data', (d) => { const e = d.toString(); if (e.trim()) logAndEmit(`⚠️ ${e}`); });
      child.on('error', (err) => { logAndEmit(`⚠️ dSYM upload error (non-fatal): ${err.message}`); resolve(); });
      child.on('close', () => { logAndEmit('✅ Sentry dSYM upload step complete.'); resolve(); });
    } catch (err) {
      logAndEmit(`⚠️ dSYM upload skipped (non-fatal): ${err.message}`);
      resolve();
    }
  });
};

const deployToS3 = async (buildId) => {
  try {
    // 1. Get build details
    const buildRes = await pool.query('SELECT project_id, artifact_path FROM builds WHERE id = $1', [buildId]);
    if (buildRes.rows.length === 0) throw new Error('Build not found');
    const build = buildRes.rows[0];

    // 2. Get secrets
    const secretsResult = await pool.query('SELECT key, value FROM project_secrets WHERE project_id = $1', [build.project_id]);
    const secrets = {};
    secretsResult.rows.forEach(s => secrets[s.key] = s.value);

    const accessKeyId = secrets.AWS_ACCESS_KEY_ID;
    const secretAccessKey = secrets.AWS_SECRET_ACCESS_KEY;
    const region = secrets.AWS_DEFAULT_REGION || 'ap-south-1';
    const bucket = secrets.S3_BUCKET_NAME;

    if (!accessKeyId || !secretAccessKey || !bucket) {
      throw new Error('Missing AWS credentials or bucket name in Secrets Vault.');
    }

    // 3. Find local artifact
    const artifactPath = path.join(__dirname, '../../public', build.artifact_path);
    if (!fs.existsSync(artifactPath)) {
      throw new Error('Local artifact not found. Please run the build again.');
    }

    const fileContent = fs.readFileSync(artifactPath);
    const fileName = 'app-release.apk';
    const cleanBucket = bucket.replace('https://', '').split('.')[0];

    // 4. Upload to S3
    const s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 300000,
        socketTimeout: 300000
      })
    });

    console.log(`🚀 Manual Deploy: Uploading to bucket [${cleanBucket}] region [${region}]`);

    await s3Client.send(new PutObjectCommand({
      Bucket: cleanBucket,
      Key: fileName,
      Body: fileContent,
      ContentType: 'application/vnd.android.package-archive'
    }));

    const s3Url = `https://${cleanBucket}.s3.${region}.amazonaws.com/${fileName}`;

    // 5. Update DB and Status
    await pool.query('UPDATE builds SET artifact_path = $1, status = $2 WHERE id = $3', [s3Url, 'success', buildId]);
    socketService.emitStatusChange(buildId, 'success');

    return s3Url;
  } catch (err) {
    console.error('S3 Manual Deploy Error:', err);
    // Revert status back to 'success' so they can retry S3 deployment
    await pool.query('UPDATE builds SET status = $1 WHERE id = $2', ['success', buildId]).catch(() => {});
    socketService.emitStatusChange(buildId, 'success');
    throw err;
  }
};

const handleS3Deploy = async (step, workspaceDir, secrets, logAndEmit, buildId) => {
  try {
    const accessKeyId = secrets.AWS_ACCESS_KEY_ID;
    const secretAccessKey = secrets.AWS_SECRET_ACCESS_KEY;
    const region = step.region || secrets.AWS_DEFAULT_REGION || 'us-east-1';
    const bucket = step.bucket || secrets.S3_BUCKET_NAME;

    if (!accessKeyId || !secretAccessKey || !bucket) {
      logAndEmit(`❌ S3 Error: Missing AWS credentials or bucket name in secrets.`);
      return false;
    }

    logAndEmit(`📦 Searching for APK to upload to S3...`);
    const buildDir = path.join(workspaceDir, 'build/app/outputs/flutter-apk');
    if (!fs.existsSync(buildDir)) {
      logAndEmit(`❌ S3 Error: Build directory not found: ${buildDir}`);
      return false;
    }

    const files = fs.readdirSync(buildDir).filter(f => f.endsWith('.apk'));
    if (files.length === 0) {
      logAndEmit(`❌ S3 Error: No .apk files found in ${buildDir}`);
      return false;
    }

    const bestApk = files.find(f => f.includes('release')) || files[0];
    const apkPath = path.join(buildDir, bestApk);
    const fileContent = fs.readFileSync(apkPath);
    const fileName = 'app-release.apk';

    logAndEmit(`🚀 Uploading ${bestApk} to S3 bucket "${bucket}"...`);

    const cleanBucket = bucket.replace('https://', '').split('.')[0];
    const s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 300000,
        socketTimeout: 300000
      })
    });

    await s3Client.send(new PutObjectCommand({
      Bucket: cleanBucket,
      Key: fileName,
      Body: fileContent,
      ContentType: 'application/vnd.android.package-archive'
    }));

    const s3Url = `https://${cleanBucket}.s3.${region}.amazonaws.com/${fileName}`;
    logAndEmit(`✅ Successfully uploaded to S3!`);
    logAndEmit(`🔗 S3 URL: ${s3Url}`);

    // Update build record with S3 URL
    await pool.query('UPDATE builds SET artifact_path = $1 WHERE id = $2', [s3Url, buildId]);

    return true;
  } catch (err) {
    logAndEmit(`❌ S3 Upload Failed: ${err.message}`);
    return false;
  }
};

const deployToTestFlight = async (buildId) => {
  let fullLogs = '';
  const logAndEmit = (text) => {
    const line = `[${new Date().toLocaleTimeString()}] ${text}`;
    fullLogs += line + '\n';
    console.log(`[TESTFLIGHT ${buildId}] ${text}`);
    socketService.emitLog(buildId, text);
  };

  try {
    logAndEmit(`🚀 Starting TestFlight upload for build ${buildId}...`);

    // 1. Fetch Build and Project details
    const buildData = await pool.query(
      `SELECT b.*, p.repo_url
       FROM builds b
       JOIN projects p ON b.project_id = p.id
       WHERE b.id = $1`,
      [buildId]
    );

    if (buildData.rows.length === 0) {
      logAndEmit(`❌ Build ${buildId} not found in DB.`);
      return;
    }
    const build = buildData.rows[0];

    // 2. Fetch Project Secrets
    const secretsResult = await pool.query(
      'SELECT key, value FROM project_secrets WHERE project_id = $1',
      [build.project_id]
    );
    const secretsEnv = {};
    secretsResult.rows.forEach(s => {
      secretsEnv[s.key] = s.value;
    });

    // 3. Workspace Directory — must match the path the build used (per-project
    // when workspace reuse is enabled, otherwise per-build).
    const WORKSPACE_BASE = path.join(process.env.HOME || '/tmp', '.ddeploy_workspaces');
    const REUSE_WORKSPACE = process.env.DDEPLOY_REUSE_WORKSPACE !== 'false';
    const workspaceDir = REUSE_WORKSPACE
      ? path.join(WORKSPACE_BASE, `project_${build.project_id}`)
      : path.join(WORKSPACE_BASE, buildId);
    const iosDir = path.join(workspaceDir, 'ios');

    logAndEmit(`📂 Checking workspace at ${iosDir}...`);
    if (!fs.existsSync(iosDir)) {
      throw new Error(`Workspace iOS directory not found at ${iosDir}. Build must be run first.`);
    }

    // The workspace is reused across builds, so it may have moved to a newer
    // commit since this build ran. Restore THIS build's archived IPA so we upload
    // the correct binary.
    try {
      if (build.artifact_path && build.artifact_path.startsWith('/artifacts/')) {
        const stableIpa = path.join(__dirname, '../../public', build.artifact_path);
        if (fs.existsSync(stableIpa)) {
          fs.copyFileSync(stableIpa, path.join(iosDir, 'Runner.ipa'));
          logAndEmit(`📦 Restored archived IPA for build #${build.build_number} into workspace.`);
        }
      }
    } catch (restoreErr) {
      logAndEmit(`⚠️ Could not restore archived IPA: ${restoreErr.message}`);
    }

    logAndEmit(`🏃 Executing "fastlane upload" inside ${iosDir}...`);

    const success = await new Promise((resolve) => {
      const child = spawn('fastlane', ['upload'], {
        cwd: iosDir,
        env: {
          ...process.env,
          ...getCacheEnv(build.project_id),
          ...secretsEnv,
          PATH: `${workspaceDir}:${process.env.PATH}`,
          FASTLANE_VERBOSE: '1'
        }
      });

      activeProcesses.set(buildId, child);

      // 45-minute timeout for upload
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        logAndEmit(`🚨 TIMEOUT: TestFlight upload exceeded 45 minutes.`);
        resolve(false);
      }, 2700000);

      child.stdout.on('data', (data) => logAndEmit(data.toString()));
      child.stderr.on('data', (data) => {
        const err = data.toString();
        if (err.trim()) logAndEmit(`⚠️ ${err}`);
      });

      child.on('error', (err) => {
        logAndEmit(`❌ Fastlane Process Error: ${err.message}`);
        resolve(false);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        activeProcesses.delete(buildId);
        if (code === 0) {
          logAndEmit(`✅ Fastlane upload completed successfully.`);
          resolve(true);
        } else {
          logAndEmit(`❌ Fastlane upload failed with code ${code}.`);
          resolve(false);
        }
      });
    });

    if (!success) {
      throw new Error('Fastlane upload execution failed.');
    }

    logAndEmit(`🎉 TestFlight upload complete!`);

    const updatedBuildRes = await pool.query('SELECT logs FROM builds WHERE id = $1', [buildId]);
    const currentLogs = updatedBuildRes.rows[0]?.logs || '';
    const newLogs = currentLogs + '\n\n=== TESTFLIGHT UPLOAD LOGS ===\n' + fullLogs;

    await pool.query(
      'UPDATE builds SET status = $1, logs = $2, testflight_uploaded = TRUE WHERE id = $3',
      ['success', newLogs, buildId]
    );
    socketService.emitStatusChange(buildId, 'success');

  } catch (error) {
    logAndEmit(`🚨 TestFlight Upload Failed: ${error.message}`);
    console.error(`[TESTFLIGHT ${buildId}] 🚨 FAILED:`, error);

    const updatedBuildRes = await pool.query('SELECT logs FROM builds WHERE id = $1', [buildId]);
    const currentLogs = updatedBuildRes.rows[0]?.logs || '';
    const newLogs = currentLogs + '\n\n=== TESTFLIGHT UPLOAD FAILED ===\n' + fullLogs;

    await pool.query(
      'UPDATE builds SET status = $1, logs = $2 WHERE id = $3',
      ['success', newLogs, buildId]
    );
    socketService.emitStatusChange(buildId, 'success');
  }
};

module.exports = {
  runBuild,
  startRunner,
  deployToS3,
  deployToTestFlight,
  abortBuild: (buildId) => {
    const process = activeProcesses.get(buildId);
    if (process) {
      process.kill('SIGKILL');
      activeProcesses.delete(buildId);
      return true;
    }
    return false;
  }
};
