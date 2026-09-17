-- ============================================================================
-- Rollback for Migration 064: Founder Start layer
-- ============================================================================
-- DESTRUCTIVE: drops both founder tables and every row in them, including the
-- append-only check-in history Claude also writes. Export first:
--
--   COPY founder_resume_points TO STDOUT WITH CSV HEADER;
--   COPY founder_checkins      TO STDOUT WITH CSV HEADER;
--
-- Migration 065 (founder plan) references founder_resume_points — roll it back
-- first. Take a snapshot before running: Supabase dashboard > Database > Backups
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS founder_checkins;
DROP TABLE IF EXISTS founder_resume_points;

COMMIT;
