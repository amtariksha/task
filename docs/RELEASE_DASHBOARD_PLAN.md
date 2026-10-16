# Release Dashboard — Implementation Plan

> Status: Draft for review · 2026-10-16
> Scope: one admin dashboard that **shows** and **triggers** releases for the web app and the mobile app (Android, then iOS).

## Built so far (2026-10-16): Releases tab, version tracking

- **Tab:** Work → Releases (`/releases`), visible to every signed-in user. Company admins add, edit and remove apps and add past versions. Everyone else can view and press Refresh.
- **Apps are added by store link:** App Store link and/or Play Store link. Name and icon are filled in from the store.
- **iOS:** full version history (dates and notes) read from the App Store page's "Version History", with the iTunes lookup API as a fallback for the current version.
- **Android:** Google publishes no history, so the current version and update date are read from the Play page. History builds up from each sync, and admins can enter older versions by hand.
- **Sync:** when an app is added or edited, from the Refresh button (at most once per minute per app), and by a daily Vercel cron (`/api/cron/release-versions`, 04:00 UTC).
- **Data:** migration `066_release_apps` creates `release_apps` and `release_app_versions`, scoped per company.
- **Next:** the release trigger (sections 2–6 below). Its table will reference `release_apps`.

---

## 1. Goal

An admin opens **Admin → Releases** and sees one card per app:

| Field | Example |
|---|---|
| App name | Karmayog Android (`com.karmayog`) |
| Previous released version | 1.4.0 (build 22) |
| Current released version | 1.4.1 (build 23) |
| In-flight release (if any) | 1.4.2 (build 24) · Building · link to CI run |

From the card they press **Release**, confirm the next version (pre-filled), and the release runs in CI. The dashboard updates as CI reports progress.

Apps covered:

| Key | Name | Pipeline today | Pipeline after |
|---|---|---|---|
| `web` | Karmayog Web | Vercel auto-deploys every push to `main` | Same deploy, plus a version tag and a release record from the dashboard |
| `android` | Karmayog Android | Manual: `upgrade_version.sh` → `eas build` → `eas submit` on a laptop | GitHub Actions run started from the dashboard |
| `ios` | Karmayog iOS | Manual (see `IOS_DEPLOYMENT_GUIDE.md`) | GitHub Actions run (phase 4) |

### How this relates to `App_Release_Hub_Feature_Doc.docx`

That doc covers **release QA** inside a sub-project: test cases, build checklist, linking tasks and bugs. This plan covers **release ops**: versions, triggering builds, and history. They don't conflict. Once both exist, a Hub release can store the `app_releases.id` it shipped as.

---

## 2. Architecture

```
 Web dashboard (/admin/releases)
        │  POST /api/releases            (admin / top_management only)
        ▼
 Next.js API route ── validates version > current, writes app_releases row (status=queued)
        │  GitHub REST: workflow_dispatch (release-mobile.yml / release-web.yml)
        ▼
 GitHub Actions
   1. bump version (non-interactive port of upgrade_version.sh)
   2. commit on release/<app>-<version>, tag <app>-v<version>
   3. build + submit  (EAS for mobile; Vercel deploy hook for web)
   4. open PR release/<app>-<version> → main
        │  POST /api/releases/callback   (HMAC-signed, at every stage)
        ▼
 app_releases row updated → dashboard polls and shows the status
```

Why GitHub Actions and not running EAS from the Vercel function: builds take 10–30 min, need the signing secrets, and must commit and tag in git. A Vercel function only starts the run and records the result.

---

## 3. Data model — migration `066_app_releases.postgresql.sql`

```sql
CREATE TABLE app_release_targets (
  id            SERIAL PRIMARY KEY,
  key           TEXT UNIQUE NOT NULL CHECK (key IN ('web','android','ios')),
  name          TEXT NOT NULL,           -- "Karmayog Android"
  identifier    TEXT,                    -- com.karmayog / bundle id / vercel project
  workflow_file TEXT NOT NULL,           -- release-mobile.yml / release-web.yml
  is_enabled    BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE app_releases (
  id               SERIAL PRIMARY KEY,
  target_id        INT NOT NULL REFERENCES app_release_targets(id),
  version          TEXT NOT NULL,        -- semver, e.g. 1.4.2
  build_number     INT,                  -- versionCode / CFBundleVersion; NULL for web
  status           TEXT NOT NULL CHECK (status IN
                     ('queued','building','submitting','released','failed','cancelled')),
  track            TEXT,                 -- internal / production / testflight / web
  release_notes    TEXT,
  git_ref          TEXT,                 -- branch the run started from
  git_sha          TEXT,
  git_tag          TEXT,
  ci_run_id        BIGINT,
  ci_run_url       TEXT,
  error_message    TEXT,
  triggered_by     INT REFERENCES users(id),   -- NULL for seeded/back-filled rows
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ,
  UNIQUE (target_id, version, build_number)
);

-- At most one release in flight per app.
CREATE UNIQUE INDEX app_releases_one_in_flight
  ON app_releases(target_id)
  WHERE status IN ('queued','building','submitting');
```

Plus a rollback file, and seed rows for the three targets. Back-fill history from `apps/mobile/CHANGELOG.md` and git tags (Android: 1.4.0/22, 1.4.1/23, …) so "previous" and "current" are correct on day one.

**Version rules**
- **Current** = latest row with `status='released'` for that app.
- **Previous** = the one released before it.
- A new release must have a semver strictly greater than current, and for mobile a `build_number` greater than current. This is checked in the API, not only in the UI.

Add a `releases` key to `AVAILABLE_TABS` in `apps/web/src/lib/permissions.ts`, give it to `top_management` (and admin), and include it in the same migration the way migration 040 did.

---

## 4. Web app work (`apps/web`)

### 4.1 API routes

| Route | Purpose |
|---|---|
| `GET /api/releases` | One summary per app: name, previous, current, in-flight |
| `GET /api/releases?target=android` | Full history for one app (paged) |
| `POST /api/releases` | Body `{ target, version, buildNumber?, track, notes }`. Checks role, validates version, inserts `queued`, calls `workflow_dispatch`, stores the run URL |
| `POST /api/releases/[id]/cancel` | Cancels the GitHub run and marks the row `cancelled` |
| `POST /api/releases/callback` | Called by CI only. Verifies `X-Release-Signature` (HMAC-SHA256 with `RELEASE_CALLBACK_SECRET`) and updates status, sha, tag, error |

Authorization uses the existing helpers in `src/lib/authz.ts`, with the same session and company scoping as the recent GraphQL authz fixes. The callback route accepts no session and is authenticated only by HMAC plus the `release_id`.

New server module `src/lib/releases/`:
- `versions.ts`: semver compare, next patch/minor suggestion, plus `__tests__/versions.test.mjs` using the existing `node --test` setup
- `github.ts`: `dispatchWorkflow()` and `cancelRun()`
- `repo.ts`: SQL queries

### 4.2 UI — `src/app/admin/releases/page.tsx`

- **App cards** (grid, stacks on mobile): icon, app name, identifier, **Previous** and **Current** version with release date, status chip, **Release** button (disabled while one is in flight).
- **Release dialog**: version (pre-filled with the next patch; minor/major chips), build number (pre-filled with current + 1; mobile only), track (Android: internal / production), release notes, and a confirm step that shows "1.4.1 → 1.4.2".
- **In-flight panel**: stage stepper (Queued → Building → Submitting → Released), "View CI run" link, Cancel. Polls `GET /api/releases` every 10 s while something is in flight.
- **History table**: version, build, track, status, who, when, tag, CI link.
- Sidebar entry under Admin, visible only with the `releases` tab.

Components go in `src/components/releases/` (`ReleaseCard`, `ReleaseDialog`, `ReleaseHistoryTable`), using the existing `ui/` primitives and Tailwind.

### 4.3 Environment variables (Vercel)

`GITHUB_RELEASE_TOKEN` (a fine-grained token or GitHub App limited to `amtariksha/task` with Actions read/write only), `GITHUB_REPO=amtariksha/task`, `RELEASE_CALLBACK_SECRET`, `VERCEL_DEPLOY_HOOK_URL` (used by the web workflow, stored as a GitHub secret).

---

## 5. Mobile app release pipeline (`apps/mobile` + CI)

### 5.1 `scripts/release/bump-version.mjs`

A non-interactive port of `upgrade_version.sh`: `--version 1.4.2 --build 24`. It updates the same five files (`app.json`, `package.json`, `build.gradle`, `Info.plist`, `project.pbxproj`) and fails if a value goes backwards. `upgrade_version.sh` becomes a thin wrapper around it, so manual and dashboard releases share one code path.

### 5.2 `.github/workflows/release-mobile.yml`

```yaml
on:
  workflow_dispatch:
    inputs:
      release_id:   { required: true }
      platform:     { required: true, type: choice, options: [android, ios] }
      version:      { required: true }
      build_number: { required: true }
      track:        { required: true, default: internal }
concurrency: release-mobile-${{ inputs.platform }}
```

Steps:
1. Callback `building`.
2. Checkout `main`, create `release/mobile-<version>` (the same naming as the existing `release/mobile-1.4.0`).
3. Run `bump-version.mjs`, then `expo prebuild --no-install`, commit `chore(mobile): release <version> (build <n>)`, tag `mobile-v<version>`, push.
4. `eas build --platform <p> --profile production --non-interactive --wait`.
5. Callback `submitting`, then `eas submit --platform <p> --latest --non-interactive` (track from input).
6. Callback `released` with sha and tag. Open a PR back to `main`.
7. On any failure, an `if: failure()` step sends `failed` with the job URL.

GitHub secrets: `EXPO_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON` (written to `google-service-account.json` at runtime), App Store Connect API key (phase 4), `RELEASE_CALLBACK_SECRET`. Signing stays EAS-managed, so no keystore goes into CI.

### 5.3 `.github/workflows/release-web.yml`

Vercel already deploys every push to `main`, so a web "release" means: bump `apps/web/package.json` version, tag `web-v<version>`, call the Vercel deploy hook for that ref, wait for the deployment to be ready, then callback `released`. Phase 1 keeps auto-deploy unchanged (see open question 2).

---

## 6. Phases

| # | Deliverable | Done when |
|---|---|---|
| 1 | Migration 066 + seed/back-fill, `GET /api/releases`, read-only dashboard | Admin sees all apps with correct previous/current versions |
| 2 | `bump-version.mjs`, `release-mobile.yml` (Android), `POST` + callback routes, Release dialog | A dashboard click ships Android to the internal track and the card updates to Released |
| 3 | `release-web.yml`, web card trigger | A web release is tagged and deployed from the dashboard |
| 4 | iOS in `release-mobile.yml` (EAS + App Store Connect key → TestFlight) | iOS card works end to end |
| 5 | Mobile app admin screen (read-only cards + Release button over the same API) | Admins can check versions and start a release from their phone |
| 6 | Nice-to-haves: reconcile with the Play Developer API / App Store Connect API for live store versions, push/email notification on release or failure, link to Release Hub records | — |

---

## 7. Open questions

1. **What counts as "released" for Android?** `eas.json` submits to the **internal** track as a **draft**. Should "current released version" mean "submitted to internal", or "live on production" (which needs the Play API to confirm, phase 6)?
2. **Web gating:** keep auto-deploy on every merge to `main` (the dashboard only tags and records), or turn off production auto-deploy so production only changes from the dashboard?
3. **iOS timing:** in scope now, or after Android is proven?
4. **Mobile app screen (phase 5):** needed, or is the web dashboard enough?

---

## 8. Security items found while planning (fix before phase 2)

- `git remote -v` shows a **GitHub personal access token embedded in the origin URL**. Revoke it, then reset the remote to a clean URL and use the credential helper or `gh auth`.
- `apps/mobile/android/app/production-upload-info.json` is **untracked but not gitignored**, and it contains the upload keystore and key passwords. Add it to `.gitignore` and move the values into a password manager before anyone runs `git add .`. `upgrade_version.sh` runs `git add .`, so the risk is real.
- The release callback must reject unsigned requests, and the GitHub token must be scoped to Actions on this one repository.
