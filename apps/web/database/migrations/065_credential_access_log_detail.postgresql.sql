-- ============================================================================
-- Migration 065: what exactly was revealed, and from where
-- Date: 2026-09-29
-- Database: PostgreSQL/Supabase
--
-- credential_access_log recorded project_id, credential_id, accessed_by, action
-- and a timestamp. That is enough to know somebody looked at a project's secrets,
-- and not enough to answer the question you actually ask after an incident:
-- WHICH secret, from WHAT, and from WHERE.
--
--   key_name   the env key revealed. Env secrets have no credential_id, so a
--              reveal of one env value was indistinguishable from a reveal of
--              the whole environment.
--   client     'web' | 'mobile' | 'api' — the mobile vault screen reveals one
--              value at a time behind biometrics, which is a different risk
--              profile from a browser session.
--   ip         the caller's address, as far as the proxy reports it.
--   user_agent truncated; only ever used to tell devices apart.
--
-- All four are nullable: existing rows keep their meaning, and an audit write
-- must never fail the operation it is recording.
--
-- SAFE TO RE-RUN (ADD COLUMN IF NOT EXISTS).
-- Rollback: 065_credential_access_log_detail_rollback.postgresql.sql
-- ============================================================================

BEGIN;

ALTER TABLE credential_access_log ADD COLUMN IF NOT EXISTS key_name   VARCHAR(255);
ALTER TABLE credential_access_log ADD COLUMN IF NOT EXISTS client     VARCHAR(16);
ALTER TABLE credential_access_log ADD COLUMN IF NOT EXISTS ip         VARCHAR(64);
ALTER TABLE credential_access_log ADD COLUMN IF NOT EXISTS user_agent VARCHAR(255);

-- The audit page reads "this project, newest first", and the reveal rate limit
-- counts one person's reveals in the last few minutes. Both are served by this.
CREATE INDEX IF NOT EXISTS idx_credential_access_log_project_time
  ON credential_access_log (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credential_access_log_actor_time
  ON credential_access_log (accessed_by, created_at DESC);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'credential_access_log' AND column_name = 'client'
    ) THEN
        RAISE NOTICE 'credential_access_log now records key_name, client, ip and user_agent';
    END IF;
END
$$;

COMMIT;

-- ============================================================================
-- VERIFY (read-only)
-- ============================================================================
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'credential_access_log'
--  ORDER BY ordinal_position;
--
-- SELECT indexname FROM pg_indexes WHERE tablename = 'credential_access_log';
