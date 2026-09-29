-- ============================================================================
-- Rollback for migration 065
--
-- Drops the four detail columns and the two indexes. The audit rows themselves
-- survive with their original meaning (who, which project, what action, when);
-- only the added detail is lost, and it cannot be reconstructed.
--
-- One transaction, so a failure leaves the table as it was rather than half
-- reverted.
-- ============================================================================

BEGIN;

DROP INDEX IF EXISTS idx_credential_access_log_actor_time;
DROP INDEX IF EXISTS idx_credential_access_log_project_time;

ALTER TABLE credential_access_log DROP COLUMN IF EXISTS user_agent;
ALTER TABLE credential_access_log DROP COLUMN IF EXISTS ip;
ALTER TABLE credential_access_log DROP COLUMN IF EXISTS client;
ALTER TABLE credential_access_log DROP COLUMN IF EXISTS key_name;

COMMIT;
