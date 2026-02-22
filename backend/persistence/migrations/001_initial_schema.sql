-- ============================================================================
-- Autonomous CI/CD Healing Agent — PostgreSQL Schema
-- Migration: 001_initial_schema.sql
--
-- Run against your Supabase (or any Postgres 14+) database:
--   psql "$DATABASE_URL" -f backend/persistence/migrations/001_initial_schema.sql
-- ============================================================================

BEGIN;

-- ── Enum types ──────────────────────────────────────────────────────────────

CREATE TYPE run_status AS ENUM ('queued', 'running', 'completed', 'failed');
CREATE TYPE ci_status  AS ENUM ('pending', 'running', 'passed', 'failed');
CREATE TYPE bug_type   AS ENUM ('LINTING', 'SYNTAX', 'LOGIC', 'TYPE_ERROR', 'IMPORT', 'INDENTATION');
CREATE TYPE patch_status AS ENUM ('passed', 'failed');
CREATE TYPE execution_method AS ENUM ('docker', 'subprocess', 'skipped');

-- ── Runs ────────────────────────────────────────────────────────────────────

CREATE TABLE runs (
  id              UUID PRIMARY KEY,
  repo_url        TEXT        NOT NULL,
  team_name       TEXT        NOT NULL,
  leader_name     TEXT        NOT NULL,
  retry_limit     INT         NOT NULL DEFAULT 5,
  status          run_status  NOT NULL DEFAULT 'queued',
  ci_status       ci_status   NOT NULL DEFAULT 'pending',
  branch_name     TEXT        NOT NULL DEFAULT '',
  project_type    TEXT        NOT NULL DEFAULT 'unknown',

  -- Counters
  failures_count  INT         NOT NULL DEFAULT 0,
  fixes_count     INT         NOT NULL DEFAULT 0,
  commit_count    INT         NOT NULL DEFAULT 0,
  current_iteration INT       NOT NULL DEFAULT 0,

  -- Scoring
  base_score         INT      NOT NULL DEFAULT 0,
  speed_bonus        INT      NOT NULL DEFAULT 0,
  efficiency_penalty INT      NOT NULL DEFAULT 0,
  execution_time_s   INT      NOT NULL DEFAULT 0,

  -- Analysis summary (stored as JSONB for flexibility)
  analysis_summary   JSONB    NOT NULL DEFAULT '{}'::jsonb,

  -- Error message (only populated on failure)
  error              TEXT,

  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_runs_status     ON runs (status);
CREATE INDEX idx_runs_created_at ON runs (created_at DESC);

-- ── Status transitions ─────────────────────────────────────────────────────

CREATE TABLE status_transitions (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id     UUID        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  from_status run_status,
  to_status   run_status NOT NULL,
  reason     TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_transitions_run_id ON status_transitions (run_id, created_at);

-- ── Test results ────────────────────────────────────────────────────────────

CREATE TABLE test_results (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id           UUID            NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  iteration        INT             NOT NULL,
  phase            TEXT            NOT NULL,  -- 'baseline' | 'verification'
  passed           BOOLEAN         NOT NULL,
  exit_code        INT             NOT NULL,
  stdout           TEXT            NOT NULL DEFAULT '',
  stderr           TEXT            NOT NULL DEFAULT '',
  duration_ms      INT             NOT NULL DEFAULT 0,
  failed_tests     JSONB           NOT NULL DEFAULT '[]'::jsonb,
  error_summary    TEXT            NOT NULL DEFAULT '',
  execution_method execution_method NOT NULL DEFAULT 'skipped',
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_test_results_run_id ON test_results (run_id, iteration);

-- ── Patches (individual fix records) ────────────────────────────────────────

CREATE TABLE patches (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id         UUID         NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  iteration      INT          NOT NULL,
  file_path      TEXT         NOT NULL,
  bug_type       bug_type     NOT NULL,
  line_number    INT          NOT NULL,
  description    TEXT         NOT NULL DEFAULT '',
  status         patch_status NOT NULL,
  commit_sha     TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_patches_run_id ON patches (run_id, iteration);

-- ── Timeline entries ────────────────────────────────────────────────────────

CREATE TABLE timeline_entries (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id       UUID        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  iteration    INT         NOT NULL,
  result       TEXT        NOT NULL,  -- 'passed' | 'failed'
  retry_count  INT         NOT NULL,
  retry_limit  INT         NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_timeline_entries_run_id ON timeline_entries (run_id, iteration);

-- ── Trigger: auto-update updated_at on runs ─────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_runs_updated_at
  BEFORE UPDATE ON runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
