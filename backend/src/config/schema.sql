-- ─────────────────────────────────────────────────────────────────────────────
-- schema.sql
-- Inhouse-Bitrise — PostgreSQL Database Schema
-- Run this file once to create all required tables.
-- Command: psql -U postgres -d inhouse_bitrise_db -f schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation (PostgreSQL extension)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: users
-- Stores registered user accounts.
-- Passwords are stored as bcrypt hashes (never plain text).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name          VARCHAR(100)        NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT                NOT NULL,
  created_at    TIMESTAMP           DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: projects
-- Represents a CI/CD project linked to a GitHub repository.
-- Each project belongs to one user (owner).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id               UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                  VARCHAR(100) NOT NULL,
  description           TEXT,
  repo_url              TEXT         NOT NULL,
  github_pat            TEXT,
  auto_trigger_enabled  BOOLEAN      DEFAULT FALSE,
  auto_trigger_branch   VARCHAR(255),
  -- Which workflows auto-trigger on a qualifying push. NULL/empty => legacy
  -- behavior (all staging-* workflows). Otherwise only the listed workflows.
  auto_trigger_workflow_ids UUID[],
  webhook_secret        TEXT,
  created_at            TIMESTAMP    DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: workflows
-- A workflow belongs to a project and contains an ordered list of
-- shell commands to run during a build (e.g., ["npm install", "npm run build"]).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  platform    VARCHAR(50)  DEFAULT 'android',
  steps       JSONB        NOT NULL,
  yml_config  TEXT,         -- Added to store raw Inhouse-Bitrise YAML
  created_at  TIMESTAMP    DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: builds
-- Records each time a workflow is triggered.
-- Status lifecycle: pending → running → success | failed
-- Logs accumulate the stdout/stderr output of all commands run.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS builds (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id  UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_id UUID         REFERENCES workflows(id) ON DELETE CASCADE,  -- NULL for manually-uploaded artifacts
  build_number INTEGER     NOT NULL,
  version     VARCHAR(50),   -- Added to store extracted version (e.g. v1.0.4)
  branch      VARCHAR(255) NOT NULL DEFAULT 'main',
  status      VARCHAR(20)  NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'success', 'failed', 'aborted', 'pending_deploy', 'deploying', 'pending_testflight', 'deploying_testflight')),
  platform    VARCHAR(50)  DEFAULT 'android',
  logs        TEXT         DEFAULT '',
  artifact_path TEXT,        -- Path to the generated APK or S3 URL
  testflight_uploaded BOOLEAN DEFAULT FALSE,
  trigger_source VARCHAR(20) DEFAULT 'manual',  -- 'manual' | 'webhook' | 'api'
  commit_sha     VARCHAR(64),
  commit_message TEXT,
  commit_author  VARCHAR(255),
  current_step   INTEGER     DEFAULT 0,  -- progress: step index reached
  total_steps    INTEGER     DEFAULT 0,  -- progress: total steps in the workflow
  started_at  TIMESTAMP,
  finished_at TIMESTAMP,
  created_at  TIMESTAMP    DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: project_secrets
-- Stores encrypted environment variables for build processes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_secrets (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         VARCHAR(255) NOT NULL,
  value       TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, key)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: runner_status
-- Stores the latest heartbeat timestamp of the build runner.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runner_status (
  id INT PRIMARY KEY,
  last_heartbeat TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: project_members
-- Tracks users who have been added to a project by the owner.
-- Role: 'admin' (can trigger builds) or 'viewer' (read-only).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_members (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(20) NOT NULL DEFAULT 'admin'
               CHECK (role IN ('admin', 'viewer')),
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- Speed up paginated build listings (per-project list + global recent feed).
-- These back the `ORDER BY created_at DESC LIMIT ... OFFSET ...` queries.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_builds_project_created ON builds (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_builds_created ON builds (created_at DESC);
