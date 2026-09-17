-- ============================================================================
-- Migration 064: Founder Start layer
-- Date: 2026-09-15
-- Database: PostgreSQL/Supabase
--
-- Founder-only tables behind the Start screen: one resume point per thread the
-- founder tracks, and an append-only history of close-outs, derived activity,
-- rank changes and generated Start briefs. Claude (via the Supabase connector)
-- reads and writes the same rows, so keep the vocabulary in the CHECKs stable.
--
-- ALREADY APPLIED to the live project as Supabase migration `founder_start`
-- (version 20260915061742). This file is the repo copy of that exact SQL —
-- do not edit it; add a new migration instead.
--
-- RLS is enabled with no policies: PostgREST roles see nothing, and the API
-- connects as `postgres`, which bypasses RLS (same as 059).
--
-- SAFE TO RE-RUN (IF NOT EXISTS / DROP TRIGGER IF EXISTS).
-- Rollback: 064_founder_start_rollback.postgresql.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS founder_resume_points (
  id                  SERIAL PRIMARY KEY,
  label               VARCHAR(120) NOT NULL,
  project_id          VARCHAR REFERENCES projects(project_id) ON DELETE SET NULL ON UPDATE CASCADE,
  next_action         TEXT,
  next_action_set_at  TIMESTAMPTZ,
  rank                INTEGER,
  waiting_on          TEXT,
  last_touched_at     TIMESTAMPTZ,
  last_touched_source VARCHAR(16),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT founder_resume_points_source_chk
    CHECK (last_touched_source IS NULL OR last_touched_source IN ('closeout', 'hook', 'karmayog', 'manual'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_founder_resume_points_project
  ON founder_resume_points (project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_founder_resume_points_label
  ON founder_resume_points (lower(label));
CREATE INDEX IF NOT EXISTS idx_founder_resume_points_rank
  ON founder_resume_points (rank) WHERE is_active;

DROP TRIGGER IF EXISTS founder_resume_points_set_updated_at ON founder_resume_points;
CREATE TRIGGER founder_resume_points_set_updated_at
  BEFORE UPDATE ON founder_resume_points
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS founder_checkins (
  id               BIGSERIAL PRIMARY KEY,
  checkin_date     DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  resume_point_id  INTEGER REFERENCES founder_resume_points(id) ON DELETE SET NULL,
  kind             VARCHAR(16) NOT NULL,
  note             TEXT,
  next_action      TEXT,
  source           VARCHAR(16) NOT NULL DEFAULT 'claude',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT founder_checkins_kind_chk   CHECK (kind IN ('closeout', 'activity', 'rank', 'start')),
  CONSTRAINT founder_checkins_source_chk CHECK (source IN ('claude', 'hook', 'app', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_founder_checkins_date
  ON founder_checkins (checkin_date DESC);
CREATE INDEX IF NOT EXISTS idx_founder_checkins_rp
  ON founder_checkins (resume_point_id, created_at DESC);

DROP TRIGGER IF EXISTS founder_checkins_immutable ON founder_checkins;
CREATE TRIGGER founder_checkins_immutable
  BEFORE DELETE OR UPDATE ON founder_checkins
  FOR EACH ROW EXECUTE FUNCTION prevent_row_mutation();

ALTER TABLE founder_resume_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE founder_checkins      ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE founder_resume_points IS
  'Founder-only: one resume point per thread (next action, weekly rank, last touched). Not exposed to team UI.';
COMMENT ON TABLE founder_checkins IS
  'Founder-only, append-only history of close-outs, derived activity, rank changes and generated Start briefs.';
