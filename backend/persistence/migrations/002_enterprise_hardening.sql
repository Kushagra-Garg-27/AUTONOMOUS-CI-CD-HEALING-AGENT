-- ============================================================================
-- Autonomous CI/CD Healing Agent — Schema Migration 002
-- Enterprise Hardening: Failure Classification, Patch Metadata, Fork + PR
--
-- Run against your database:
--   psql "$DATABASE_URL" -f backend/persistence/migrations/002_enterprise_hardening.sql
-- ============================================================================

BEGIN;

-- ── Failure Classification Enum ──

DO $$ BEGIN
  CREATE TYPE failure_category AS ENUM (
    'DEPENDENCY_INSTALL_ERROR',
    'PYTHON_IMPORT_ERROR',
    'PYTHON_SYNTAX_ERROR',
    'TEST_ASSERTION_FAILURE',
    'BUILD_ERROR',
    'ENVIRONMENT_MISSING',
    'PERMISSION_ERROR',
    'UNKNOWN_FAILURE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Push Strategy Enum ──

DO $$ BEGIN
  CREATE TYPE push_strategy AS ENUM ('direct', 'fork');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Add new columns to runs ──

ALTER TABLE runs ADD COLUMN IF NOT EXISTS failure_category  failure_category;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS failure_summary   TEXT DEFAULT '';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS raw_stderr        TEXT DEFAULT '';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS push_strategy     push_strategy;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS pr_url            TEXT;

-- ── Patch metadata table ──

CREATE TABLE IF NOT EXISTS patch_metadata (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id            UUID         NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  iteration         INT          NOT NULL,
  files_changed     INT          NOT NULL DEFAULT 0,
  lines_added       INT          NOT NULL DEFAULT 0,
  lines_removed     INT          NOT NULL DEFAULT 0,
  total_diff_lines  INT          NOT NULL DEFAULT 0,
  category_targeted failure_category,
  rationale         TEXT         NOT NULL DEFAULT '',
  approved          BOOLEAN      NOT NULL DEFAULT true,
  rejection_reason  TEXT,
  snapshot_sha      TEXT,
  changed_file_paths JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patch_metadata_run_id ON patch_metadata (run_id, iteration);

-- ── Remediation diagnostics table ──

CREATE TABLE IF NOT EXISTS remediation_diagnostics (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id            UUID         NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  iteration         INT          NOT NULL,
  failure_category  failure_category,
  failure_summary   TEXT         NOT NULL DEFAULT '',
  confidence        REAL         NOT NULL DEFAULT 0,
  matched_patterns  JSONB        NOT NULL DEFAULT '[]'::jsonb,
  missing_deps      JSONB        NOT NULL DEFAULT '[]'::jsonb,
  fault_files       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  strategy_used     TEXT         NOT NULL DEFAULT '',
  strategy_result   TEXT         NOT NULL DEFAULT '',
  commit_decision   TEXT         NOT NULL DEFAULT '',
  commit_reason     TEXT         NOT NULL DEFAULT '',
  patch_approved    BOOLEAN      NOT NULL DEFAULT false,
  diff_summary      TEXT         NOT NULL DEFAULT '',
  push_strategy     push_strategy,
  pr_url            TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remediation_diagnostics_run_id ON remediation_diagnostics (run_id, iteration);

COMMIT;
