#!/usr/bin/env bash
# Usage: founder-ingest.sh "<thread label>" "<summary>" [occurredAt ISO-8601]
#
# Posts one activity entry to Karmayog's ingestFounderActivity mutation.
# Always exits 0 so hooks and cron jobs never break; FOUNDER_INGEST_STRICT=1
# makes a failed post exit 1 instead. Never writes to stdout.
# FOUNDER_INGEST_DEBUG=1 prints the HTTP status and response to stderr.
set -uo pipefail

readonly CONFIG_DIR="${FOUNDER_CONFIG_DIR:-$HOME/.config/karmayog}"
readonly CONFIG_FILE="$CONFIG_DIR/founder.env"
readonly MAX_SUMMARY_CHARS=480
readonly MAX_LABEL_CHARS=120
readonly TIMEOUT_SECONDS=10
readonly MUTATION='mutation($t:String!,$e:[FounderActivityEntryInput!]!){ingestFounderActivity(token:$t,entries:$e)}'

warn() { printf 'founder-ingest: %s\n' "$*" >&2; }
is_debug() { [[ "${FOUNDER_INGEST_DEBUG:-0}" == 1 ]]; }
fail() {
  warn "$*"
  [[ "${FOUNDER_INGEST_STRICT:-0}" == 1 ]] && exit 1
  exit 0
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  printf '%s' "${value%"${value##*[![:space:]]}"}"
}

load_config() {
  [[ -r "$CONFIG_FILE" ]] || fail "config not found: $CONFIG_FILE"
  local mode
  # -L: a symlinked founder.env must report its target's mode, not the link's 777.
  mode="$(stat -L -c '%a' "$CONFIG_FILE" 2>/dev/null || true)"
  if [[ -n "$mode" && "${mode: -2}" != "00" ]]; then
    warn "$CONFIG_FILE is readable by other users (mode $mode); run: chmod 600 $CONFIG_FILE"
  fi
  read_config_file || fail "could not read $CONFIG_FILE"
  [[ -n "${KARMAYOG_GRAPHQL_URL:-}" ]] || fail "KARMAYOG_GRAPHQL_URL is not set in $CONFIG_FILE"
  [[ -n "${FOUNDER_INGEST_TOKEN:-}" ]] || fail "FOUNDER_INGEST_TOKEN is not set in $CONFIG_FILE"
  case "$KARMAYOG_GRAPHQL_URL" in
    https://*|http://localhost:*|http://localhost/*|http://127.0.0.1:*|http://127.0.0.1/*) ;;
    http://*) warn "KARMAYOG_GRAPHQL_URL is plain http; the token is sent unencrypted" ;;
    *) fail "KARMAYOG_GRAPHQL_URL must be an http(s) URL" ;;
  esac
}

# Parsed, not sourced: a `$` in the token stays literal, and nothing in the file
# can abort the script under `set -u`. Accepts KEY=value, KEY='value',
# KEY="value", an `export ` prefix, blank lines and # comments.
read_config_file() {
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="$(trim "${line%$'\r'}")"
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    line="${line#export }"
    key="$(trim "${line%%=*}")"
    value="$(trim "${line#*=}")"
    case "$value" in
      \"*) value="${value:1}"; value="${value%%\"*}" ;;
      \'*) value="${value:1}"; value="${value%%\'*}" ;;
      *) value="$(trim "${value%%[[:space:]]#*}")" ;;
    esac
    case "$key" in
      KARMAYOG_GRAPHQL_URL) KARMAYOG_GRAPHQL_URL="$value" ;;
      FOUNDER_INGEST_TOKEN) FOUNDER_INGEST_TOKEN="$value" ;;
    esac
  done <"$CONFIG_FILE"
}

redact() {
  local text="$1"
  printf '%s' "${text//"$FOUNDER_INGEST_TOKEN"/<redacted>}"
}

# The token reaches jq through its environment (env.FOUNDER_INGEST_TOKEN), never
# through argv, which any local user can read in ps / /proc/<pid>/cmdline.
build_payload() {
  FOUNDER_INGEST_TOKEN="$FOUNDER_INGEST_TOKEN" jq -cn \
    --arg q "$MUTATION" --arg l "$1" --arg s "$2" --arg ts "$3" \
    --argjson maxLabel "$MAX_LABEL_CHARS" --argjson maxSummary "$MAX_SUMMARY_CHARS" '
      def tidy($max): gsub("\\s+"; " ") | sub("^ "; "") | sub(" $"; "") | .[0:$max];
      {query: $q,
       variables: {t: env.FOUNDER_INGEST_TOKEN,
                   e: [{label: $l[0:$maxLabel],
                        summary: ($s | tidy($maxSummary)),
                        occurredAt: $ts}]}}'
}

# Redact before truncating: a cut through the token would defeat the redaction.
one_line() {
  local text
  text="$(redact "${1//[$'\r\n']/ }")"
  trim "${text:0:300}"
}

report_response() {
  local status="$1" body="$2" errors
  if is_debug; then
    warn "HTTP $status"
    warn "response: $(redact "$body")"
  fi
  [[ "$status" == 200 ]] || fail "HTTP $status from $KARMAYOG_GRAPHQL_URL: $(one_line "$body")"
  errors="$(jq -r '[.errors[]?.message] | join("; ")' <<<"$body" 2>/dev/null)" \
    || fail "response is not JSON: $(one_line "$body")"
  [[ -z "$errors" ]] || fail "GraphQL error: $(one_line "$errors")"
  if is_debug; then
    # 0 means the server dropped it: same note on the same thread within 20 minutes.
    warn "applied: $(jq -r '.data.ingestFounderActivity // "?"' <<<"$body" 2>/dev/null)"
  fi
}

main() {
  if (( $# < 2 || $# > 3 )); then
    fail 'usage: founder-ingest.sh "<label>" "<summary>" [occurredAt]'
  fi
  local label summary occurred_at
  label="$(trim "$1")"
  summary="$(trim "$2")"
  occurred_at="$(trim "${3:-}")"
  [[ -n "$label" ]] || fail 'label must not be empty'
  [[ -n "$summary" ]] || fail 'summary must not be empty'
  if [[ -z "$occurred_at" ]]; then
    occurred_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  elif [[ ! "$occurred_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}([T ][0-9:.]+(Z|[+-][0-9]{2}:?[0-9]{2})?)?$ ]]; then
    fail "occurredAt is not an ISO-8601 timestamp: $occurred_at"
  fi

  local tool
  for tool in curl jq; do
    command -v "$tool" >/dev/null 2>&1 || fail "$tool is not installed"
  done
  load_config

  local payload response
  payload="$(build_payload "$label" "$summary" "$occurred_at")" || fail 'could not build the request body'
  response="$(printf '%s' "$payload" | curl -sS --max-time "$TIMEOUT_SECONDS" --proto '=http,https' \
    -H 'content-type: application/json' -H 'accept: application/json' \
    -w '\n%{http_code}' --data-binary @- "$KARMAYOG_GRAPHQL_URL" 2>&1)" \
    || fail "request failed: $(one_line "${response%$'\n'*}")"

  report_response "${response##*$'\n'}" "${response%$'\n'*}"
}

main "$@"
exit 0
