#!/usr/bin/env bash
# Nightly scan: for every git repo under $FOUNDER_PROJECTS_DIR that has an entry
# in founder-map.json, posts "<n> commits: <latest three subjects>" for the
# founder's own commits since the last successful scan of that repo (first run:
# the last 24 hours; never more than 7 days) to the mapped founder thread.
# Per-repo failures never stop the scan; the script exits 0 and logs a one-line
# summary to stderr.
set -uo pipefail

readonly PROJECTS_DIR="${FOUNDER_PROJECTS_DIR:-/mnt/work/projects}"
readonly CONFIG_DIR="${FOUNDER_CONFIG_DIR:-$HOME/.config/karmayog}"
readonly MAP_FILE="$CONFIG_DIR/founder-map.json"
readonly CACHE_DIR="$HOME/.cache/karmayog"
readonly DEFAULT_WINDOW_SECONDS=$(( 24 * 3600 ))
readonly MAX_WINDOW_SECONDS=$(( 7 * 24 * 3600 ))
readonly MAX_SUBJECTS=3

log() { printf 'founder-git-scan: %s\n' "$*" >&2; }

script_dir() {
  local self
  self="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null)" || self="${BASH_SOURCE[0]}"
  dirname "$self"
}

map_label() {
  jq -r --arg key "$1" 'if type == "object" then (.[$key] // empty | strings) else empty end' \
    "$MAP_FILE" 2>/dev/null
}

# Per repo: when the last scan that posted or found nothing started. The next
# scan starts there, so a run missed while the machine was off (caught up by
# Persistent=true) or the timer's random delay neither drops nor repeats commits.
since_file() {
  printf '%s/scan-%s.since' "$CACHE_DIR" "$(printf '%s' "$1" | sha256sum | cut -c1-16)"
}

scan_since() {
  local file="$1" now="$2" since=""
  [[ -r "$file" ]] && since="$(tr -dc '0-9' <"$file" 2>/dev/null | cut -c1-12)"
  [[ -z "$since" ]] || since=$(( 10#$since ))
  if [[ -z "$since" ]] || (( since > now )); then
    since=$(( now - DEFAULT_WINDOW_SECONDS ))
  fi
  if (( since < now - MAX_WINDOW_SECONDS )); then
    since=$(( now - MAX_WINDOW_SECONDS ))
  fi
  printf '%s' "$since"
}

mark_scanned() {
  local file="$1" started_at="$2"
  if ! { mkdir -p "$CACHE_DIR" && printf '%s\n' "$started_at" >"$file.tmp" && mv -f "$file.tmp" "$file"; }; then
    log "cannot write $file"
  fi
}

# One --author per founder identity: the repo's user.email plus FOUNDER_GIT_AUTHORS
# (space- or comma-separated emails, e.g. for commits made under another identity).
author_args() {
  local email extra="${FOUNDER_GIT_AUTHORS:-}"
  local -a emails=()
  read -ra emails <<<"$(git -C "$1" config user.email 2>/dev/null) ${extra//,/ }"
  for email in "${emails[@]}"; do
    printf -- '--author=<%s>\n' "$email"
  done
}

# One line per commit: "<committer time in UTC ISO-8601><TAB><subject>".
# Only local work counts: fetched remote-tracking refs (teammates' commits),
# prefetch refs, notes and stashes are excluded, and so are merges.
# --no-show-signature: log.showSignature=true would add lines to the output.
recent_commits() {
  local dir="$1" since_iso="$2"
  shift 2
  TZ=UTC git -C "$dir" log --no-show-signature --no-merges --since="$since_iso" \
    --fixed-strings "$@" \
    --exclude='refs/stash' --exclude='refs/remotes/*' --exclude='refs/prefetch/*' --exclude='refs/notes/*' --all \
    --date='format-local:%Y-%m-%dT%H:%M:%SZ' --format='%cd%x09%s'
}

build_summary() {
  local count="$1" subjects="$2" noun=commits
  (( count == 1 )) && noun=commit
  local joined
  joined="$(awk -v max="$MAX_SUBJECTS" 'NF && !seen[$0]++ { out = (n ? out "; " : "") $0; if (++n == max) exit } END { printf "%s", out }' <<<"$subjects")"
  printf '%s %s: %s' "$count" "$noun" "${joined:-(no subject)}"
}

# Prints posted | quiet | failed.
scan_repo() {
  local dir="$1" label="$2" ingest="$3" started_at state since since_iso commits
  local -a authors=()
  mapfile -t authors < <(author_args "$dir")
  if (( ${#authors[@]} == 0 )); then
    log "${dir##*/}: no author to match; set git user.email or FOUNDER_GIT_AUTHORS"
    echo failed
    return
  fi
  started_at="$(date +%s)"
  state="$(since_file "$dir")"
  since="$(scan_since "$state" "$started_at")"
  since_iso="$(date -u -d "@$since" +%Y-%m-%dT%H:%M:%SZ)"
  if ! commits="$(recent_commits "$dir" "$since_iso" "${authors[@]}")"; then
    log "${dir##*/}: git log failed"
    echo failed
    return
  fi
  if [[ -z "$commits" ]]; then
    mark_scanned "$state" "$started_at"
    echo quiet
    return
  fi

  local count latest subjects summary
  count=$(( $(wc -l <<<"$commits") ))
  latest="$(cut -f1 <<<"$commits" | sort | tail -n 1)"
  subjects="$(cut -f2- <<<"$commits")"
  summary="$(build_summary "$count" "$subjects")"
  if FOUNDER_INGEST_STRICT=1 "$ingest" "$label" "$summary" "$latest" </dev/null >/dev/null; then
    mark_scanned "$state" "$started_at"
    echo posted
  else
    log "${dir##*/}: posting to \"$label\" failed"
    echo failed
  fi
}

main() {
  local tool
  for tool in git jq sha256sum; do
    command -v "$tool" >/dev/null 2>&1 || { log "$tool is not installed"; return 0; }
  done
  [[ -r "$MAP_FILE" ]] || { log "map not found: $MAP_FILE"; return 0; }
  [[ -d "$PROJECTS_DIR" ]] || { log "projects dir not found: $PROJECTS_DIR"; return 0; }
  local ingest
  ingest="$(script_dir)/founder-ingest.sh"
  [[ -x "$ingest" ]] || { log "not executable: $ingest"; return 0; }

  local scanned=0 posted=0 quiet=0 failed=0 dir label result
  for dir in "$PROJECTS_DIR"/*/; do
    dir="${dir%/}"
    [[ -e "$dir/.git" ]] || continue
    label="$(map_label "${dir##*/}")"
    [[ -n "$label" ]] || continue
    scanned=$((scanned + 1))
    result="$(scan_repo "$dir" "$label" "$ingest")"
    case "$result" in
      posted) posted=$((posted + 1)) ;;
      quiet) quiet=$((quiet + 1)) ;;
      *) failed=$((failed + 1)) ;;
    esac
  done
  log "scanned $scanned mapped repos in $PROJECTS_DIR: $posted posted, $quiet without commits, $failed failed"
}

main
exit 0
