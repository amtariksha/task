# Karmayog — Changelog

This file tracks user-facing changes to the mobile app. The text in each
version section can be copy-pasted into Play Console's "What's new in
this version" field on release.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- Convert test cases to bugs directly from the bug detail screen
- Display Expected Behavior, Actual Behavior, Server Logs, Frontend Logs
  on bug detail screens when populated
- Sign in with email address in addition to employee ID

### Changed
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
