#!/usr/bin/env bash

set -uo pipefail

KNOWN=(chrome-devtools github google-drive k6 playwright postman database-readonly)
DEFAULT=(chrome-devtools github google-drive k6 playwright postman)
AGENT="codex"
REQUESTED=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent=*) AGENT="${1#*=}"; shift ;;
    --agent) AGENT="${2:-}"; shift 2 ;;
    *) REQUESTED+=("$1"); shift ;;
  esac
done

[[ ${#REQUESTED[@]} -gt 0 ]] || REQUESTED=("${DEFAULT[@]}")

has_name() {
  local candidate="$1"
  local item
  for item in "${KNOWN[@]}"; do
    [[ "$item" == "$candidate" ]] && return 0
  done
  return 1
}

runtime_check() {
  case "$1" in
    chrome-devtools|google-drive|playwright|database-readonly) command -v npx >/dev/null 2>&1 ;;
    postman) return 0 ;;
    github) [[ "$AGENT" == "antigravity" ]] || command -v codex >/dev/null 2>&1 ;;
    k6) command -v k6 >/dev/null 2>&1 ;;
  esac
}

codex_configured() {
  codex mcp get "$1" >/dev/null 2>&1
}

antigravity_configured() {
  local name="$1"
  local repo_dir config
  repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  for config in "${ANTIGRAVITY_GLOBAL_MCP_CONFIG:-$HOME/.gemini/config/mcp_config.json}" \
                "${ANTIGRAVITY_WORKSPACE_MCP_CONFIG:-$repo_dir/.agents/mcp_config.json}"; do
    [[ -f "$config" ]] || continue
    python3 - "$config" "$name" <<'PY' >/dev/null 2>&1 && return 0
import json
import sys
with open(sys.argv[1], encoding="utf-8") as handle:
    server = json.load(handle).get("mcpServers", {}).get(sys.argv[2])
raise SystemExit(0 if isinstance(server, dict) and not server.get("disabled", False) else 1)
PY
  done
  return 1
}

case "$AGENT" in
  codex)
    command -v codex >/dev/null 2>&1 || { printf '%s\n' 'FAILED codex runtime_missing'; exit 1; }
    ;;
  antigravity)
    ;;
  *)
    printf 'FAILED unsupported_agent=%s\n' "$AGENT" >&2
    exit 2
    ;;
esac

failures=0
for name in "${REQUESTED[@]}"; do
  if ! has_name "$name"; then
    printf 'FAILED %s unknown_server\n' "$name"
    failures=$((failures + 1))
    continue
  fi

  if [[ "$AGENT" == "codex" ]]; then
    codex_configured "$name" && config_status=configured || config_status=mcp_not_configured
  else
    antigravity_configured "$name" && config_status=configured || config_status=mcp_not_configured
  fi
  [[ "$config_status" == configured ]] || failures=$((failures + 1))

  if runtime_check "$name"; then
    runtime_status=runtime_available
  else
    runtime_status=runtime_missing
    failures=$((failures + 1))
  fi
  printf '%s agent=%s config=%s runtime=%s\n' "$name" "$AGENT" "$config_status" "$runtime_status"
done

if [[ "$AGENT" == "codex" ]]; then
  printf '%s\n' 'MANUAL mở phiên Codex mới và chạy smoke test read-only'
else
  printf '%s\n' 'MANUAL chạy /mcp trong Antigravity rồi smoke test read-only'
fi

[[ "$failures" -eq 0 ]]
