// src/config/db.js
// ─────────────────────────────────────────────────────────────────────────────
// PostgreSQL connection pool configuration.
// Uses the `pg` library with a pool to efficiently handle multiple
// concurrent database connections.
// All credentials are loaded from environment variables via dotenv.
// ─────────────────────────────────────────────────────────────────────────────

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Create a connection pool using either a connection string or individual variables
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Required for Render/Heroku/AWS external connections
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Test the connection and auto-initialize tables
pool.connect(async (err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ PostgreSQL connected successfully');
    
    try {
      // 1. Check for project_secrets table (latest feature)
      const resSecrets = await client.query("SELECT to_regclass('public.project_secrets') as exists");
      if (!resSecrets.rows[0].exists) {
        console.log('📦 Missing project_secrets table. Running setup...');
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schemaSql);
        console.log('✅ project_secrets initialized');
      }

      // 2. Check for yml_config column in workflows table (migration)
      const resYml = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='workflows' and column_name='yml_config';
      `);
      if (resYml.rows.length === 0) {
        console.log('📦 Adding missing yml_config column to workflows...');
        await client.query("ALTER TABLE workflows ADD COLUMN yml_config TEXT;");
        console.log('✅ yml_config column added');
      }

      // 3. Check for build_number column in builds table (migration)
      const resBuildNum = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='builds' and column_name='build_number';
      `);
      if (resBuildNum.rows.length === 0) {
        console.log('📦 Adding missing build_number column to builds...');
        await client.query("ALTER TABLE builds ADD COLUMN build_number INTEGER DEFAULT 1;");
        console.log('✅ build_number column added');
      }

      // 4. Check for branch column in builds table
      const resBranch = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name='builds' and column_name='branch';
      `);
      if (resBranch.rows.length === 0) {
        console.log('📦 Adding missing branch column to builds...');
        await client.query("ALTER TABLE builds ADD COLUMN branch VARCHAR(255) NOT NULL DEFAULT 'main';");
        console.log('✅ branch column added');
      }

      // 5. Check for artifact_path column in builds table
      const resArtifact = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name='builds' and column_name='artifact_path';
      `);
      if (resArtifact.rows.length === 0) {
        console.log('📦 Adding missing artifact_path column to builds...');
        await client.query("ALTER TABLE builds ADD COLUMN artifact_path TEXT;");
        console.log('✅ artifact_path column added');
      }

      // 6. Check for version column in builds table
      const resVersion = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name='builds' and column_name='version';
      `);
      if (resVersion.rows.length === 0) {
        console.log('📦 Adding missing version column to builds...');
        await client.query("ALTER TABLE builds ADD COLUMN version VARCHAR(50);");
        console.log('✅ version column added');
      }

      // 7. Check for platform column in workflows table
      const resWfPlatform = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name='workflows' and column_name='platform';
      `);
      if (resWfPlatform.rows.length === 0) {
        console.log('📦 Adding missing platform column to workflows...');
        await client.query("ALTER TABLE workflows ADD COLUMN platform VARCHAR(50) DEFAULT 'android';");
        console.log('✅ platform column added to workflows');
      }

      // 8. Check for platform column in builds table
      const resBuildPlatform = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name='builds' and column_name='platform';
      `);
      if (resBuildPlatform.rows.length === 0) {
        console.log('📦 Adding missing platform column to builds...');
        await client.query("ALTER TABLE builds ADD COLUMN platform VARCHAR(50) DEFAULT 'android';");
        console.log('✅ platform column added to builds');
      }

      // 9. Check for testflight_uploaded column in builds table
      const resTfUploaded = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name='builds' and column_name='testflight_uploaded';
      `);
      if (resTfUploaded.rows.length === 0) {
        console.log('📦 Adding missing testflight_uploaded column to builds...');
        await client.query("ALTER TABLE builds ADD COLUMN testflight_uploaded BOOLEAN DEFAULT FALSE;");
        console.log('✅ testflight_uploaded column added');
      }

      // 10. Check for auto_trigger_enabled column in projects table
      const resAutoTrigger = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name='projects' and column_name='auto_trigger_enabled';
      `);
      if (resAutoTrigger.rows.length === 0) {
        console.log('📦 Adding missing auto_trigger_enabled column to projects...');
        await client.query("ALTER TABLE projects ADD COLUMN auto_trigger_enabled BOOLEAN DEFAULT FALSE;");
        console.log('✅ auto_trigger_enabled column added');
      }

      // 11. Check for auto_trigger_branch column in projects table
      const resAutoTriggerBranch = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name='projects' and column_name='auto_trigger_branch';
      `);
      if (resAutoTriggerBranch.rows.length === 0) {
        console.log('📦 Adding missing auto_trigger_branch column to projects...');
        await client.query("ALTER TABLE projects ADD COLUMN auto_trigger_branch VARCHAR(255);");
        console.log('✅ auto_trigger_branch column added');
      }

      // 12. Check for webhook_secret column in projects table
      const resWebhookSecret = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name='projects' and column_name='webhook_secret';
      `);
      if (resWebhookSecret.rows.length === 0) {
        console.log('📦 Adding missing webhook_secret column to projects...');
        await client.query("ALTER TABLE projects ADD COLUMN webhook_secret TEXT;");
        console.log('✅ webhook_secret column added');
      }

      // 13. Update builds status check constraint
      try {
        await client.query("ALTER TABLE builds DROP CONSTRAINT IF EXISTS builds_status_check;");
        await client.query("ALTER TABLE builds ADD CONSTRAINT builds_status_check CHECK (status IN ('pending', 'running', 'success', 'failed', 'aborted', 'pending_deploy', 'deploying', 'pending_testflight', 'deploying_testflight'));");
        console.log('✅ builds_status_check constraint updated');
      } catch (constraintErr) {
        console.warn('⚠️ Constraint migration warning:', constraintErr.message);
      }

      // 14. Performance indexes for paginated build listings.
      // Without these, the per-project list and the global recent-builds feed
      // do a full scan + sort of the builds table on every page load.
      try {
        await client.query("CREATE INDEX IF NOT EXISTS idx_builds_project_created ON builds (project_id, created_at DESC);");
        await client.query("CREATE INDEX IF NOT EXISTS idx_builds_created ON builds (created_at DESC);");
        console.log('✅ builds pagination indexes ensured');
      } catch (indexErr) {
        console.warn('⚠️ Index migration warning:', indexErr.message);
      }

      // 15. Build metadata columns: trigger source, commit info, step progress.
      // Powers the duration / trigger-type / commit-message / progress-bar UI.
      try {
        const buildMetaCols = [
          ['trigger_source', "VARCHAR(20) DEFAULT 'manual'"],
          ['commit_sha', 'VARCHAR(64)'],
          ['commit_message', 'TEXT'],
          ['commit_author', 'VARCHAR(255)'],
          ['current_step', 'INTEGER DEFAULT 0'],
          ['total_steps', 'INTEGER DEFAULT 0'],
        ];
        for (const [col, type] of buildMetaCols) {
          const r = await client.query(
            "SELECT column_name FROM information_schema.columns WHERE table_name='builds' AND column_name=$1",
            [col]
          );
          if (r.rows.length === 0) {
            await client.query(`ALTER TABLE builds ADD COLUMN ${col} ${type};`);
            console.log(`✅ builds.${col} column added`);
          }
        }
      } catch (metaErr) {
        console.warn('⚠️ Build metadata migration warning:', metaErr.message);
      }

      // 16. Allow NULL workflow_id so manually-uploaded artifacts (which have no
      // workflow) can be stored as builds. Idempotent.
      try {
        await client.query('ALTER TABLE builds ALTER COLUMN workflow_id DROP NOT NULL;');
        console.log('✅ builds.workflow_id is now nullable (manual uploads)');
      } catch (nullErr) {
        console.warn('⚠️ workflow_id nullable migration warning:', nullErr.message);
      }

      // 17. Per-project auto-trigger workflow selection. When NULL/empty the
      // webhook falls back to the legacy "all staging-* workflows" behavior, so
      // existing projects keep working. When populated, only the listed
      // workflows are auto-built on a qualifying push.
      const resAutoWf = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name='projects' AND column_name='auto_trigger_workflow_ids';
      `);
      if (resAutoWf.rows.length === 0) {
        console.log('📦 Adding missing auto_trigger_workflow_ids column to projects...');
        await client.query('ALTER TABLE projects ADD COLUMN auto_trigger_workflow_ids UUID[];');
        console.log('✅ auto_trigger_workflow_ids column added');
      }

      // 18. Workflow versioning — version counter on workflows + snapshot table.
      try {
        // Add version column to workflows if missing
        const resWfVersion = await client.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name='workflows' AND column_name='version';
        `);
        if (resWfVersion.rows.length === 0) {
          console.log('📦 Adding version column to workflows...');
          await client.query('ALTER TABLE workflows ADD COLUMN version INTEGER NOT NULL DEFAULT 1;');
          console.log('✅ workflows.version column added');
        }

        // Add updated_at column to workflows if missing
        const resWfUpdatedAt = await client.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name='workflows' AND column_name='updated_at';
        `);
        if (resWfUpdatedAt.rows.length === 0) {
          console.log('📦 Adding updated_at column to workflows...');
          await client.query('ALTER TABLE workflows ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();');
          console.log('✅ workflows.updated_at column added');
        }

        // Add saved_by column to workflow_versions if missing
        const resWfvSavedBy = await client.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name='workflow_versions' AND column_name='saved_by';
        `);
        if (resWfvSavedBy.rows.length === 0) {
          console.log('📦 Adding saved_by column to workflow_versions...');
          await client.query('ALTER TABLE workflow_versions ADD COLUMN saved_by UUID REFERENCES users(id) ON DELETE SET NULL;');
          console.log('✅ workflow_versions.saved_by column ensured');
        }

        // Add commit_message column to workflow_versions if missing
        const resWfvMessage = await client.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name='workflow_versions' AND column_name='commit_message';
        `);
        if (resWfvMessage.rows.length === 0) {
          console.log('📦 Adding commit_message column to workflow_versions...');
          await client.query('ALTER TABLE workflow_versions ADD COLUMN commit_message TEXT;');
          console.log('✅ workflow_versions.commit_message column ensured');
        }
      } catch (wfColErr) {
        console.warn('⚠️ workflows column migration warning:', wfColErr.message);
      }

      // Ensure workflow_versions table exists (table schema may vary — created by
      // older migration or newdesign branch with version_number instead of version).
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS workflow_versions (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workflow_id  UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            version_number INTEGER NOT NULL DEFAULT 1,
            name         VARCHAR(255) NOT NULL DEFAULT '',
            steps        JSONB,
            yml_config   TEXT,
            platform     VARCHAR(50),
            saved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (workflow_id, version_number)
          );
        `);
        console.log('✅ workflow_versions table ensured');

        // Always ensure saved_by column exists (older tables may lack it)
        await client.query(
          'ALTER TABLE workflow_versions ADD COLUMN IF NOT EXISTS saved_by UUID;'
        );
        console.log('✅ workflow_versions.saved_by column ensured');

        await client.query(
          'CREATE INDEX IF NOT EXISTS idx_wf_versions_workflow ON workflow_versions (workflow_id, version_number DESC);'
        );
        console.log('✅ workflow_versions index ensured');
      } catch (wfvErr) {
        console.warn('⚠️ workflow_versions migration warning:', wfvErr.message);
      }

      // 19. Track who added project secrets
      try {
        const resSecretAddedBy = await client.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name='project_secrets' AND column_name='added_by';
        `);
        if (resSecretAddedBy.rows.length === 0) {
          console.log('📦 Adding added_by column to project_secrets...');
          await client.query('ALTER TABLE project_secrets ADD COLUMN added_by UUID REFERENCES users(id) ON DELETE SET NULL;');
          console.log('✅ project_secrets.added_by column added');
        }
      } catch (secretErr) {
        console.warn('⚠️ project_secrets column migration warning:', secretErr.message);
      }
    } catch (setupErr) {
      console.error('⚠️ Database initialization warning:', setupErr.message);
    } finally {
      release();
    }
  }
});

module.exports = pool;
