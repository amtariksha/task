# Founder machine scripts

These scripts run on the founder's own machine. They add work that happens
outside Karmayog to the founder **Start** threads, so a thread counts as
touched when you worked on it in Claude Code or committed to its repo. They
post through the `ingestFounderActivity` GraphQL mutation. Each post becomes
an `activity` check-in with `source = hook`.

| File | What it does |
| --- | --- |
| `founder-ingest.sh "<label>" "<summary>" [occurredAt]` | Posts one entry. Every other script calls it. |
| `founder-claude-stop-hook.sh` | Claude Code `Stop` hook. It posts `Claude Code session in <repo>`, and appends ` · last commit: <subject>` when the last commit is less than 2 hours old. |
| `founder-git-scan.sh` | Nightly scan. For each mapped repo with your commits since its last successful scan, it posts `<n> commits: <latest three subjects joined with "; ">` (prefixed with `<repo>: ` for repos nested in a project folder). |
| `systemd/founder-git-scan.{service,timer}` | systemd user units. They run the scan every day at 18:00 UTC (23:30 IST). |

All three scripts:

- **Always exit 0.** A missing config file, a missing tool, a network error or
  a rejected token prints a one-line message on stderr and exits 0, so it never
  breaks Claude Code or the timer.
- **Never write to stdout.**
- **Never print the token.** The token reaches `jq` through the environment
  and `curl` through stdin, so it never appears in `ps` output. Error messages
  are redacted before they are shortened, and the server's development request
  log redacts the token variable.

## Prerequisites

- `bash` 4+, `curl`, `jq` 1.6+, and `git` 2.31+.
- The token must match the server's `FOUNDER_INGEST_TOKEN` env var.
- Optional: systemd (user instance), for the nightly timer.

## Install

Config lives **outside the repo**, in `~/.config/karmayog/`.

```bash
mkdir -p ~/.config/karmayog

# 1. Endpoint and token: one KEY='value' per line. The file is read, not
#    sourced, so a `$` in the token is kept as-is. Keep it private.
cat > ~/.config/karmayog/founder.env <<'EOF'
KARMAYOG_GRAPHQL_URL='https://<your-karmayog-host>/api/graphql'
FOUNDER_INGEST_TOKEN='<same value as the server FOUNDER_INGEST_TOKEN>'
EOF
chmod 600 ~/.config/karmayog/founder.env

# 2. Repo directory name -> Start thread label (repos not listed are ignored).
#    Keys are directory names under /mnt/work/projects (check with
#    `ls /mnt/work/projects`); on this machine the Karmayog checkout is `task`.
cat > ~/.config/karmayog/founder-map.json <<'EOF'
{ "task": "Karmayog" }
EOF

# 3. Copy the scripts (run from the repo root)
install -m 755 scripts/founder/founder-ingest.sh scripts/founder/founder-claude-stop-hook.sh \
  scripts/founder/founder-git-scan.sh ~/.config/karmayog/

# 4. Nightly git scan
mkdir -p ~/.config/systemd/user
cp scripts/founder/systemd/founder-git-scan.service scripts/founder/systemd/founder-git-scan.timer ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now founder-git-scan.timer
```

Map keys are directory **basenames**. Labels are matched case-insensitively
against existing thread labels. **An unknown label creates a new thread**, so
spell labels exactly as they appear on Start. A new thread is linked to a
Karmayog project automatically only when its label matches exactly one
project name (case-insensitive), e.g. `Swarg`.

A key can also be a **project folder that holds several repos** (for example
`/mnt/work/projects/amtarikshadev-Swarg`, which contains `swargnodejsbackend`,
`swargdeliveryapp`, …). A repo nested one level inside such a folder is matched
by its own name first, then by the folder's name, so one entry covers the whole
folder. This also keeps repos with the same name in different folders apart
(e.g. `communityos` under both `ezcondo` and `amtariksha-project3-communityOS`).

Example for a machine with that layout:

```json
{
  "task": "Karmayog",
  "nisarg": "Nisarg",
  "amtarikshadev-Swarg": "Swarg",
  "eassy": "EassyLife",
  "ezcondo": "EzCondo"
}
```

The scripts are **copies**, not symlinks. A symlink into the checkout breaks as
soon as you switch to a branch without `scripts/founder/`, and the Stop hook
would then fail after every reply. After pulling changes to these scripts,
run step 3 again.

### Claude Code Stop hook

Add this to `~/.claude/settings.json`, merging it with any hooks you already have:

```json
{ "hooks": { "Stop": [ { "matcher": "", "hooks": [ { "type": "command", "command": "f=\"$HOME/.config/karmayog/founder-claude-stop-hook.sh\"; [ -x \"$f\" ] && \"$f\"; exit 0" } ] } ] } }
```

The command exits 0 even when the script is missing, so a broken install never
shows up as a hook error in Claude Code.

Claude Code sends the hook JSON on stdin, and the hook reads `cwd` from it. The
hook looks up the repo name in the map in this order:

1. The main checkout's directory name. This covers sessions started in a
   sub-directory or a git worktree.
2. `basename(cwd)`.
3. The name of the folder that contains the checkout (a project folder such
   as `amtarikshadev-Swarg`).

The post always names the repo you worked in.

If none of these names is in the map, the hook does nothing.

The HTTP call runs detached with `nohup`, so the hook returns in about 0.1 s.

### Nightly scan

The scan covers every repo directly in `${FOUNDER_PROJECTS_DIR:-/mnt/work/projects}`
and, for folders there that are not repos themselves, every repo one level
inside them; a repo is scanned when its own name or (for nested repos) its
folder's name is a key in the map. Posts for nested repos start with
`<repo>: `. For each repo it runs
`git log --all` over **your** commits only:

- **Authors:** the repo's `git config user.email`, plus any emails in
  `FOUNDER_GIT_AUTHORS`. Commits made under another identity (for example
  `noreply@anthropic.com`) count only if you list that email there.
- **Refs:** local branches, tags and `HEAD`. Fetched remote-tracking refs
  (teammates' commits), prefetch refs, notes, stashes and merge commits are
  left out.
- **Window:** from the start of the last scan of that repo that posted or found
  nothing. The first scan covers the last 24 hours, and a window never exceeds
  7 days. That start time is kept in `~/.cache/karmayog/scan-<hash>.since`.
  Delete the file to fall back to 24 hours.

The newest commit time is sent as `occurredAt`, so the thread's "last touched"
time is when you committed, not when the scan ran.

When the scan finishes, it logs one summary line:

```bash
journalctl --user -u founder-git-scan.service -n 20
systemctl --user list-timers founder-git-scan.timer
```

With `Persistent=true`, a run missed while the machine was off happens at the
next boot, and it covers everything since the last successful scan. That run
fails if the network is not up yet, and the log shows it. The next run then
picks up the same commits.

## Environment switches

| Variable | Effect |
| --- | --- |
| `FOUNDER_INGEST_DEBUG=1` | Prints the HTTP status, the GraphQL response (token redacted) and the number of entries applied to stderr. The Stop hook then keeps stderr and posts in the foreground. |
| `FOUNDER_INGEST_STRICT=1` | `founder-ingest.sh` exits 1 when a post fails. The git scan sets this to count failures. |
| `FOUNDER_PROJECTS_DIR` | Directory the git scan looks in. Default: `/mnt/work/projects`. |
| `FOUNDER_GIT_AUTHORS` | Extra author emails (space- or comma-separated) that the git scan counts as yours. For the timer, set it with `systemctl --user edit founder-git-scan.service`: add `[Service]`, then `Environment=FOUNDER_GIT_AUTHORS=...`. |
| `FOUNDER_CONFIG_DIR` | Alternative to `~/.config/karmayog`, for testing. |

## Testing

```bash
# One entry, verbose ("applied: 1" = recorded, "applied: 0" = duplicate)
FOUNDER_INGEST_DEBUG=1 ~/.config/karmayog/founder-ingest.sh "Karmayog" "manual test"

# The hook, as Claude Code would call it (use a mapped repo)
echo '{"cwd":"/mnt/work/projects/task"}' | FOUNDER_INGEST_DEBUG=1 ~/.config/karmayog/founder-claude-stop-hook.sh

# The scan, now
FOUNDER_INGEST_DEBUG=1 ~/.config/karmayog/founder-git-scan.sh
systemctl --user start founder-git-scan.service   # or run it through systemd
```

The entries then appear under the thread's last check-ins on Start, on both
web and mobile.

## How duplicates are avoided

- **Server:** `ingestFounderActivity` skips an entry when the same thread
  already has a `hook` check-in with the same summary from the last
  20 minutes. The response then counts it as `0` applied.
- **Hook:** Claude Code runs `Stop` hooks after **every** reply, not only when a
  session ends, so the hook also debounces. It touches
  `~/.cache/karmayog/<label>-<hash>.last` and posts nothing more for that label
  for 20 minutes. `<label>` is the first 40 characters of the label, with
  characters outside `A-Za-z0-9._-` replaced by `_`. `<hash>` comes from the
  whole label, so different labels never share a file. To post again straight
  away, delete that file.
- **Scan:** each scan starts where the last successful one started, so a
  commit is reported once. The 20-minute server window catches manual re-runs
  after a failed scan.
