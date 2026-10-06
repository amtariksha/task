# Karmayog — Changelog

This file tracks user-facing changes to the mobile app. The text in each
version section can be copy-pasted into Play Console's "What's new in
this version" field on release.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Fixed
- The security PIN can be set again. In 1.3.0 and 1.4.0, **Save** on
  **Confirm New PIN** did nothing and no PIN was stored, so the app never
  locked. If saving a PIN ever fails, the dialog now says so.

---

## [1.4.0] — 2026-10-05

### Added
- **Brain dump** (founder accounts only): Start → ⋮ → Brain dump. Type or
  dictate one thought per line, check the list, and save it all as threads
  in one go. The text is kept as a draft until it is saved.

### Fixed
- An expired session on the Feed, Notifications, Attendance or Start screens
  now returns you to the sign-in screen instead of leaving them failing to load
- Adding a project or a sub-project no longer says it failed when the project
  was created, which led to creating it twice
- Create Task lists only your real projects and their sub-projects. The
  placeholder names (dsn, amtariksha, task management, swarg, other; testing,
  development, reporting) are gone, so a task can no longer be filed under a
  project that does not exist. If you are in no project yet, the screen says so
- Saving a new order on the Rank screen no longer asks whether to discard it

---

## [1.3.0] — 2026-09-29

### Added
- Convert test cases to bugs directly from the bug detail screen
- Display Expected Behavior, Actual Behavior, Server Logs, Frontend Logs
  on bug detail screens when populated
- Sign in with email address in addition to employee ID
- **Project secrets** (read-only): credential names and environment keys per
  project, revealing one value at a time behind a fingerprint or face
  prompt. Screenshots are blocked on that screen, a revealed value hides
  after 30 seconds and when the app goes to the background, and copying
  clears the clipboard after 45 seconds. Adding and editing stay on the web.
- Tapping a notification now opens what it refers to, the same as tapping
  the push
- The company you are working in is shown in the drawer, when you belong to
  more than one
- Your role in a project is shown on the members list, and a project
  manager can change it
- Requirements can be deleted by their author

### Changed
- The security PIN is now optional. Nothing is forced at sign-in; set it up,
  change it or turn it off from Settings
- Freezing a requirements version, and restoring an older section, now ask
  first — both are hard to undo
- Requirement search covers the whole project, not only the rows already
  loaded
- App branded as **Karmayog** (was "JSR Task Management")
- New "Energetic Startup" theme: Vibrant Purple primary, dark mode by
  default
- Status / priority / severity badges now use a consistent semantic
  color system with icons for colorblind accessibility

### Fixed
- Graceful "No Access" message when a user has lost access to a bug or
  task's project (previously showed a generic error)
- Quick actions, swipe actions and the notification settings screen no
  longer report "Success" when the change was actually refused
- Approvals: no Approve/Reject buttons on your own requests, an empty team
  no longer shows everyone else's pending requests, and failed attendance
  decisions now say why
- The security PIN is stored per user, so a second account on the same
  device is no longer locked behind the first account's PIN, and the lock
  screen now offers "Forgot PIN? Sign out"
- Switching company refreshes every screen instead of only Settings
- Project details shows edit and delete controls based on your role in
  that project rather than your global role
- Bug and task assignee lists are limited to members of the chosen project
- Feature requests and releases are no longer labelled "Bug"
- Requirements: sections written with formatting on the web are read-only
  on mobile instead of being flattened, saving an unedited section no
  longer creates a revision or reopens an approved requirement, and edit
  controls only appear if you have requirements-edit access
- Work-from-home details can be opened and deleted again (the screen was
  reaching an endpoint that did not exist)
- ID card no longer misspells the company name

---

## [1.2.0] — 2026-09-17

### Added
- **Start** (founder accounts only): the app opens on a daily Start
  screen with your Top 3 threads, every other thread and how long since
  it was touched, items waiting on you, and Claude's notes.
- 60-second end-of-day close-out, weekly thread ranking, pausing the
  morning Start notification, and parking threads.
- A 09:00 IST Start notification that opens the Start screen.

Nothing changes for other accounts.

---

## [1.0.0] — Initial release

First release of Karmayog. Includes:

- Task and bug tracking with project assignment
- Attendance, leave, and WFH application flow
- Team feed with posts, mentions, and reactions
- Biometric login + email/employee ID sign in
- Push notifications
- Offline-aware data layer
