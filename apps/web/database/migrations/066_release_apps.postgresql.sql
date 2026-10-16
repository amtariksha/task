-- ============================================================================
-- Migration 066: Releases tab — apps and their store version history
-- Date: 2026-10-16
-- Database: PostgreSQL/Supabase
--
-- The Releases tab shows, for every app a company ships, the version that is
-- live in each store now and the one before it, with the full history below.
--
--   release_apps          one row per app (e.g. "PassKard"), owned by a company.
--                         The App Store / Play Store links admins pasted are
--                         kept as typed; the ids parsed out of them are what the
--                         sync uses, so the server only ever fetches store URLs
--                         it built itself.
--   release_app_versions  one row per (app, platform, version) ever seen.
--                         iOS history is back-filled from the App Store's
--                         "Version History"; Google publishes no history, so
--                         Android rows accumulate from each sync, plus any an
--                         admin enters by hand (source = 'manual').
--
-- Release triggering (a later phase) will add its own table that references
-- release_apps; nothing here needs to change for it.
--
-- SAFE TO RE-RUN (IF NOT EXISTS throughout).
-- Rollback: 066_release_apps_rollback.postgresql.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS release_apps (
    app_id              SERIAL PRIMARY KEY,
    company_id          VARCHAR(50) NOT NULL
                        REFERENCES companies(company_id) ON DELETE CASCADE ON UPDATE CASCADE,
    name                VARCHAR(120) NOT NULL,
    icon_url            TEXT,

    ios_url             TEXT,
    ios_app_id          VARCHAR(20),
    ios_country         VARCHAR(2),
    ios_sync_error      TEXT,

    android_url         TEXT,
    android_package     VARCHAR(255),
    android_sync_error  TEXT,

    last_synced_at      TIMESTAMPTZ,
    created_by          VARCHAR(50) REFERENCES users(employee_id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT release_apps_has_store CHECK (ios_app_id IS NOT NULL OR android_package IS NOT NULL)
);

-- The tab lists one company's live apps.
CREATE INDEX IF NOT EXISTS idx_release_apps_company
    ON release_apps (company_id)
    WHERE deleted_at IS NULL;

-- The same store listing cannot be added twice to one company.
CREATE UNIQUE INDEX IF NOT EXISTS uq_release_apps_company_ios
    ON release_apps (company_id, ios_app_id)
    WHERE deleted_at IS NULL AND ios_app_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_release_apps_company_android
    ON release_apps (company_id, android_package)
    WHERE deleted_at IS NULL AND android_package IS NOT NULL;

CREATE TABLE IF NOT EXISTS release_app_versions (
    id              SERIAL PRIMARY KEY,
    app_id          INTEGER NOT NULL REFERENCES release_apps(app_id) ON DELETE CASCADE,
    platform        VARCHAR(10) NOT NULL CHECK (platform IN ('ios', 'android')),
    version         VARCHAR(64) NOT NULL,
    -- The store's own date for this version. Play reports "last updated", which
    -- is the release date of the version it is currently showing.
    released_at     TIMESTAMPTZ,
    release_notes   TEXT,
    source          VARCHAR(16) NOT NULL CHECK (source IN ('app_store', 'play_store', 'manual')),
    -- When this dashboard first saw the version. For Android this is the closest
    -- thing to a release date once Play has moved on to a newer version.
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(50) REFERENCES users(employee_id) ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT uq_release_app_versions UNIQUE (app_id, platform, version)
);

COMMIT;

-- ============================================================================
-- VERIFY (read-only)
-- ============================================================================
-- SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--  WHERE table_name IN ('release_apps', 'release_app_versions')
--  ORDER BY table_name, ordinal_position;
--
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('release_apps', 'release_app_versions');
