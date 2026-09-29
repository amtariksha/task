# API Authorization Audit

Status as of the tenancy work (migrations 061–063). Records what every `/api`
route enforces, so the routes that are still only *authenticated* are visible
rather than assumed safe.

## Two different questions

**Authentication** — is there a valid session? Handled centrally by
`apps/web/src/proxy.ts`, which is **fail-closed**: everything under `/api`
requires a valid JWT unless it appears in a short allowlist. Adding a new route
gets you this for free.

**Authorization** — may *this* user touch *this* record? Per-route, and the
subject of this document. The helpers live in `apps/web/src/lib/authz.ts`:

| Helper | Question |
|---|---|
| `isSameCompany` | Is the record in the caller's company? **Runs before every other check.** |
| `canViewUser` | May the caller see this employee's records? (self / reports at any depth / company admin) |
| `canEditWorkItem` | May the caller modify this task, bug or requirement? |
| `canViewWorkItem` | May the caller read it? |
| `canApproveFor` | May the caller approve for this employee? **False for self.** |
| `canManageProject` | May the caller edit or delete this project? |
| `canAdminCompany` | Is the caller an admin of this company? |
| `canManageCompanies` | Platform admin only. |

`requireUserAccess(request, employeeId)` in `lib/auth-server.ts` is the shared
route-level guard for anything keyed by an employee ID.

## Public by design

`auth/login`, `auth/logout`, `auth/otp/request`, `auth/otp/verify`, `health`.

`graphql` is public **at the transport layer only** — it is one endpoint
carrying both public and private operations, and the mobile app signs in through
its `login` mutation. Authorization lives in the resolvers, which receive the
verified user via context.

`cron/*` requires `Authorization: Bearer $CRON_SECRET`, not a user session.
**`CRON_SECRET` must be set** or the scheduled jobs will 401.

## Disabled in production

`test-email`, `debug-email`, `verify-email`, `simple-test`, `test`,
`diagnostic/*`, `cache/test` — these send real mail and dump schema details.
They return 404 when `NODE_ENV=production`.

## Authorized

| Route | Enforces |
|---|---|
| `users` GET/POST | Company-scoped list; create requires `canManageUsers` and places the user in the *caller's* company |
| `users/[employeeId]` PUT | Self, or admin/top_management; non-privileged callers cannot change role/status/permissions |
| `users/team/[managerId]` | Own team, or admin/top_management |
| `users/batch` | Session required |
| `users/[employeeId]/warning/reset` | `requireUserAccess`; self-reset refused |
| `users/[employeeId]/send-credentials` | Admin/top_management |
| `tasks` GET/POST | Company-scoped list |
| `tasks/[taskId]` GET/PUT/DELETE | `canAccessTask` (read) / `canModifyTask` (write), both behind `isSameCompany` |
| `tasks/user/[employeeId]` | `requireUserAccess` |
| `bugs` GET/POST | Company-scoped list |
| `bugs/[bugId]` GET/PUT/DELETE | `canAccessBug` / `canModifyBug`, both behind `isSameCompany` |
| `work-items/user/[employeeId]` | `requireUserAccess` |
| `projects` GET/POST | Membership-filtered; create requires `canAdminCompany` |
| `projects/hierarchy` | Company-scoped, then membership-filtered |
| `projects/[projectId]` PUT/DELETE | `canManageProject` |
| `projects/[projectId]/restore` | `canManageProject` |
| `projects/[projectId]/users` GET/POST/PATCH/DELETE | `canManageProject` for mutations |
| `projects/[projectId]/credentials`, `env` | `assertProjectSecretAccess` |
| `leaves/[id]` PUT/PATCH | `canApproveFor` for decisions; owner or `canViewUser` otherwise |
| `leaves/[id]/reject` | `canApproveFor`; approver taken from the session |
| `leaves/user/[employeeId]` | `requireUserAccess` |
| `wfh` POST | `requireUserAccess` on the named employee |
| `wfh/[id]` PUT/PATCH | `canApproveFor` for decisions |
| `wfh/[id]/reject` | `canApproveFor`; approver taken from the session |
| `wfh/user/[employeeId]` | `requireUserAccess` |
| `half-day`, `work-hours` | `requireUserAccess` when an employeeId is supplied |
| `notification-preferences` GET/POST | `requireUserAccess` |
| `permissions` GET/POST | `canAdminCompany` |
| `companies` GET/POST | Membership; `canManageCompanies` to create or list all |
| `companies/switch` | Membership verified server-side |
| `settings` GET | Company-scoped resolution |
| `activity-log/[id]` | Verifies the token directly |

## ⚠️ Authenticated but NOT individually authorized

These require a valid session — no anonymous access — but do **not** verify that
the caller owns or can reach the specific record. A signed-in user of company A
may still reach company B's rows here.

Most are sub-resources whose authorization should flow from their parent work
item (a checklist belongs to a task; a comment belongs to a bug). Doing that
properly means loading the parent and calling `canEditWorkItem`, which is a
focused piece of work rather than a one-line guard.

| Route | Why it matters |
|---|---|
| `bugs/[bugId]/comments` | Comments on any bug |
| `bugs/[bugId]/related` | Relationship graph of any bug |
| `bugs/completed-for-release` | Cross-project bug list |
| `bugs/subtasks`, `bugs/subtasks/[id]` | Read/modify subtasks of any bug |
| `tasks/[taskId]/related` | Relationship graph of any task |
| `tasks/subtasks` | Subtasks of any task |
| `tasks/support` | Support assignments |
| `tasks/update-delayed` | Bulk status mutation |
| `task-checklists`, `task-checklists/[id]`, `task-checklists/reorder` | Checklist items on any task |
| `development-checklists`, `[id]`, `reorder` | Checklist items on any bug |
| `relationships`, `relationships/[id]` | Create/delete links between items |
| `deleted-items` | Lists soft-deleted rows — **not company-scoped** |
| `metrics` GET/DELETE | Operational metrics; DELETE clears them |
| `settings/validate` | Validates a settings payload |
| `projects/[projectId]/users/[employeeId]/artifacts` | Per-user artifact counts |

### Recommended next step

Add a `requireWorkItemAccess(request, { taskId | bugId })` helper that loads the
parent and delegates to `canEditWorkItem`, then apply it across the checklist,
subtask, comment and relationship routes. That covers most of the table above in
one consistent change.

`deleted-items` and `metrics` need their own treatment: the first should be
company-scoped, the second restricted to platform admins.

## Verifying

The middleware gate was tested against a production build: data routes 401
without a session and pass with a valid token (Bearer and cookie); forged and
expired tokens are rejected; `/api/graphql` and `/api/health` stay reachable;
dev-only routes 404; cron rejects a missing or wrong secret.

To re-check which routes lack an explicit authorization call:

```bash
cd apps/web/src/app/api
for f in $(find . -name route.ts | sort); do
  p="${f#./}"
  case "$p" in auth/*|health/*|cron/*|graphql/*|debug-email/*|test-email/*|verify-email/*|simple-test/*|test/*|diagnostic/*|cache/*) continue;; esac
  grep -qE "requireAuth|requireRole|getAuthUser|requireUserAccess|assertProjectSecretAccess|verifyToken" "$f" || echo "  $p"
done
```
