#!/usr/bin/env bash
# Claude Code Stop hook: records "Claude Code session in <repo>" on the mapped
# founder thread. Claude Code shows hook stdout and treats non-zero exits as
# hook errors, so this script prints nothing and always exits 0.
# FOUNDER_INGEST_DEBUG=1 keeps stderr and posts in the foreground.
set -uo pipefail
# Even an unexpected shell error (e.g. an unset variable under set -u) exits 0.
trap 'exit 0' EXIT

exec >/dev/null
[[ "${FOUNDER_INGEST_DEBUG:-0}" == 1 ]] || exec 2>/dev/null

readonly CONFIG_DIR="${FOUNDER_CONFIG_DIR:-$HOME/.config/karmayog}"
readonly MAP_FILE="$CONFIG_DIR/founder-map.json"
readonly CACHE_DIR="$HOME/.cache/karmayog"
readonly DEBOUNCE_MINUTES=20
readonly RECENT_COMMIT_SECONDS=7200

log() { printf 'founder-stop-hook: %s\n' "$*" >&2; }

script_dir() {
  local self
  self="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null)" || self="${BASH_SOURCE[0]}"
  dirname "$self"
}

read_hook_cwd() {
  local input=""
  [[ -t 0 ]] || input="$(timeout 2 cat 2>/dev/null || true)"
  local cwd
  cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null || true)"
  printf '%s' "${cwd:-${CLAUDE_PROJECT_DIR:-$PWD}}"
}

map_label() {
  jq -r --arg key "$1" 'if type == "object" then (.[$key] // empty | strings) else empty end' \
    "$MAP_FILE" 2>/dev/null
}

# The main checkout's directory (also for a sub-directory or a git worktree),
# or nothing outside a git repo.
checkout_root() {
  local common_dir
  common_dir="$(git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [[ "$common_dir" == */.git ]]; then
    dirname "$common_dir"
  fi
}

# Map keys to try, in order: the checkout's name, the cwd's name, then the name
# of the folder holding the checkout, so one key such as "amtarikshadev-Swarg"
# covers every repo nested inside that folder.
repo_candidates() {
  local cwd="$1" root="$2"
  [[ -z "$root" ]] || basename "$root"
  basename "$cwd"
  [[ -z "$root" ]] || basename "$(dirname "$root")"
}

# A readable prefix plus a hash of the whole label: different labels never share a
# marker, and long non-ASCII labels stay within the 255-byte file-name limit.
marker_file() {
  local readable hash
  readable="$(printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_' | cut -c1-40)"
  hash="$(printf '%s' "$1" | sha256sum | cut -c1-16)"
  printf '%s/%s-%s.last' "$CACHE_DIR" "$readable" "$hash"
}

is_debounced() {
  local marker="$1"
  [[ -f "$marker" && -n "$(find "$marker" -mmin "-$DEBOUNCE_MINUTES" 2>/dev/null)" ]]
}

recent_commit_subject() {
  local cwd="$1" line committed_at
  # --no-show-signature: log.showSignature=true would put a line before the commit.
  line="$(git -C "$cwd" log -1 --no-show-signature --format='%ct%x09%s' 2>/dev/null)" || return 0
  committed_at="${line%%$'\t'*}"
  [[ "$committed_at" =~ ^[0-9]+$ ]] || return 0
  if (( $(date +%s) - committed_at < RECENT_COMMIT_SECONDS )); then
    printf '%s' "${line#*$'\t'}"
  fi
}

main() {
  command -v jq >/dev/null 2>&1 || { log 'jq is not installed'; return 0; }
  [[ -r "$MAP_FILE" ]] || { log "map not found: $MAP_FILE"; return 0; }

  local cwd root repo label="" candidate
  cwd="$(read_hook_cwd)"
  [[ -d "$cwd" ]] || { log "cwd is not a directory: $cwd"; return 0; }
  root="$(checkout_root "$cwd")"
  # The post names the repo actually worked in, even when a parent folder's key matched.
  repo="$(basename "${root:-$cwd}")"
  while IFS= read -r candidate; do
    label="$(map_label "$candidate")"
    [[ -z "$label" ]] || break
  done < <(repo_candidates "$cwd" "$root")
  [[ -n "$label" ]] || { log "no founder-map entry for $cwd"; return 0; }

  local marker
  marker="$(marker_file "$label")"
  if is_debounced "$marker"; then
    log "debounced: \"$label\" was posted less than $DEBOUNCE_MINUTES minutes ago"
    return 0
  fi
  if ! { mkdir -p "$CACHE_DIR" && touch "$marker"; }; then
    log "cannot write $marker"
    return 0
  fi

  local summary subject ingest
  summary="Claude Code session in $repo"
  subject="$(recent_commit_subject "$cwd")"
  [[ -z "$subject" ]] || summary="$summary · last commit: $subject"

  ingest="$(script_dir)/founder-ingest.sh"
  [[ -x "$ingest" ]] || { log "not executable: $ingest"; return 0; }
  if [[ "${FOUNDER_INGEST_DEBUG:-0}" == 1 ]]; then
    "$ingest" "$label" "$summary"
  else
    # Detached so Claude Code is not held up by the (up to 10 s) HTTP call.
    nohup "$ingest" "$label" "$summary" </dev/null >/dev/null 2>&1 &
    disown
  fi
}

main || true
exit 0
