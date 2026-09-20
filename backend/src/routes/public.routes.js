// src/routes/public.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// Public Routes — No authentication required.
// Used for the public APK install page accessible via Teams build card link.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const os = require('os');

// Helper to get local IP address
const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
};

// GET /api/public/builds/:id — Return build info publicly (for install page)
router.get('/builds/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT b.id, b.build_number, b.status, b.platform, b.branch, b.version,
              b.artifact_path, b.trigger_source, b.created_at, b.finished_at,
              p.name as project_name
       FROM builds b
       JOIN projects p ON b.project_id = p.id
       WHERE b.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Build not found.' });
    }

    const build = result.rows[0];

    // Precise artifact type from the file extension.
    const ext = (build.artifact_path || '').split('.').pop().toLowerCase();
    const fileType = ext === 'ipa' ? 'IPA' : ext === 'aab' ? 'AAB' : 'APK';

    // Build the direct download URL for the artifact. Android always; iOS only
    // for manually-uploaded artifacts (CI iOS builds go via TestFlight).
    const isUpload = build.trigger_source === 'upload';
    let downloadUrl = null;
    if (build.artifact_path && (build.platform !== 'ios' || isUpload)) {
      if (build.artifact_path.startsWith('http')) {
        downloadUrl = build.artifact_path;
      } else {
        const baseUrl = process.env.MASTER_URL && process.env.MASTER_URL !== 'http://localhost:5002'
          ? process.env.MASTER_URL
          : `${req.protocol}://${req.get('host')}`;
        downloadUrl = `${baseUrl}${build.artifact_path}`;
      }
    }

    return res.status(200).json({
      success: true,
      build: {
        id: build.id,
        buildNumber: build.build_number,
        status: build.status,
        platform: build.platform,
        branch: build.branch,
        version: build.version,
        projectName: build.project_name,
        triggerSource: build.trigger_source,
        fileType,
        createdAt: build.created_at,
        finishedAt: build.finished_at,
        builtAt: build.finished_at || build.created_at,
        downloadUrl,
        localIp: getLocalIp()
      }
    });
  } catch (error) {
    console.error('Public build fetch error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// POST /api/public/builds/:id/upload — Stream build artifact (APK/IPA) from local runner to API server
//
// Integrity matters more here than it looks. This handler used to pipe the body
// straight to its final path and reply 200 on writeStream 'finish', with no check
// that the whole body actually arrived. A dropped runner→API connection therefore
// published a TRUNCATED APK as a successful upload: Android's download manager
// sees a smaller-but-self-consistent Content-Length, reports the download as
// complete, and the install then dies with the generic "There was a problem while
// parsing the package" (the ZIP end-of-archive record is missing).
//
// Now the body lands in <name>.part, gets verified, and is only then renamed into
// place — so a partial transfer fails loudly instead of shipping a corrupt build.
// Verification degrades gracefully for older runners that send neither
// Content-Length nor X-File-Sha256: req.complete alone still catches truncation.
router.post('/builds/:id/upload', (req, res) => {
  const { id } = req.params;

  // path.basename() because this route is UNAUTHENTICATED — a crafted X-File-Name
  // such as "../../server.js" would otherwise be an arbitrary file write.
  const rawName = req.headers['x-file-name'] || `build_${id}.apk`;
  const fileName = path.basename(String(rawName));

  const artifactDir = path.join(__dirname, '../../public/artifacts');

  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  const destination = path.join(artifactDir, fileName);
  const tempPath = `${destination}.part`;
  const writeStream = fs.createWriteStream(tempPath);

  const expectedBytes = Number(req.headers['content-length']) || null;
  const expectedSha = String(req.headers['x-file-sha256'] || '').toLowerCase() || null;
  const hash = crypto.createHash('sha256');
  let received = 0;
  let settled = false;

  const fail = (code, message) => {
    if (settled) return;
    settled = true;
    console.error(`❌ Artifact upload rejected for build ${id}: ${message}`);
    writeStream.destroy();
    // Drop the partial file — never leave something installable behind.
    fs.rm(tempPath, { force: true }, () => {});
    if (!res.headersSent) return res.status(code).json({ success: false, message });
  };

  req.on('data', (chunk) => {
    received += chunk.length;
    hash.update(chunk);
  });

  req.on('error', (err) => fail(400, `Upload stream error after ${received} bytes: ${err.message}`));

  // On an aborted request the source never emits 'end', so pipe() never ends the
  // write stream and 'finish' below would never fire — this is what answers the
  // runner (and cleans up) when the connection drops mid-transfer.
  req.on('close', () => {
    if (!settled && !req.complete) {
      fail(400, `Connection closed after ${received} bytes before the body was complete`);
    }
  });

  writeStream.on('error', (err) => fail(500, `Could not write artifact: ${err.message}`));

  writeStream.on('finish', () => {
    if (settled) return;

    // The one check that works for every runner: false when the client
    // disconnected before the full body arrived, including chunked uploads
    // that carry no Content-Length at all.
    if (!req.complete) {
      return fail(400, `Incomplete upload: connection closed after ${received} bytes`);
    }
    if (expectedBytes !== null && received !== expectedBytes) {
      return fail(400, `Size mismatch: expected ${expectedBytes} bytes, received ${received}`);
    }
    const actualSha = hash.digest('hex');
    if (expectedSha && actualSha !== expectedSha) {
      return fail(400, `Checksum mismatch: expected ${expectedSha}, got ${actualSha}`);
    }

    try {
      // Atomic within the same directory — readers of /artifacts never observe
      // a half-written file under the real name.
      fs.renameSync(tempPath, destination);
    } catch (err) {
      return fail(500, `Could not publish artifact: ${err.message}`);
    }

    settled = true;
    console.log(`📦 Saved uploaded artifact to: ${destination} (${received} bytes, sha256 ${actualSha})`);
    return res.status(200).json({
      success: true,
      message: 'Artifact uploaded successfully',
      bytes: received,
      sha256: actualSha
    });
  });

  req.pipe(writeStream);
});

module.exports = router;
