-- ============================================================================
-- Rollback for migration 066
--
-- Drops the Releases tab tables. Store-sourced history can be fetched again by
-- re-running 066 and re-adding the apps, but Android versions the store no
-- longer shows, and every manually entered version, are lost for good.
--
-- One transaction, so a failure leaves both tables as they were.
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS release_app_versions;
DROP TABLE IF EXISTS release_apps;

COMMIT;
