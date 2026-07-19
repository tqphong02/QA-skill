#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/setup_lib.sh"

SKILLS_DIR="${SKILLS_DIR:-$HOME/.gemini/config/skills}"
WORKSPACE_CONFIG="${ANTIGRAVITY_WORKSPACE_MCP_CONFIG:-$REPO_DIR/.agents/mcp_config.json}"
GLOBAL_CONFIG="${ANTIGRAVITY_GLOBAL_MCP_CONFIG:-$HOME/.gemini/config/mcp_config.json}"
ALLOW_MISSING_RUNTIME=0
[[ "${1:-}" == "--allow-missing-runtime" ]] && ALLOW_MISSING_RUNTIME=1
failures=0

if command -v agy >/dev/null 2>&1; then
  printf 'PASS runtime agy=%s\n' "$(command -v agy)"
elif [[ -d "/Applications/Antigravity.app" ]]; then
  printf '%s\n' 'PASS runtime Antigravity.app'
elif [[ "$ALLOW_MISSING_RUNTIME" -eq 1 ]]; then
  printf '%s\n' 'BLOCKED runtime_missing antigravity live_slash_test_unavailable'
else
  printf '%s\n' 'FAILED runtime_missing antigravity'
  failures=$((failures + 1))
fi

for skill in "${DEFAULT_SKILLS[@]}"; do
  if [[ -f "$SKILLS_DIR/$skill/SKILL.md" ]]; then
    printf 'PASS skill=%s\n' "$skill"
  else
    printf 'FAILED skill_missing=%s expected=%s\n' "$skill" "$SKILLS_DIR/$skill/SKILL.md"
    failures=$((failures + 1))
  fi
done

config_found=0
for config in "$WORKSPACE_CONFIG" "$GLOBAL_CONFIG"; do
  [[ -f "$config" ]] || continue
  config_found=1
  if python3 -m json.tool "$config" >/dev/null 2>&1; then
    printf 'PASS mcp_config=%s\n' "$config"
  else
    printf 'FAILED invalid_mcp_json=%s\n' "$config"
    failures=$((failures + 1))
  fi
done

if [[ "$config_found" -eq 0 ]]; then
  printf '%s\n' 'FAILED mcp_not_configured antigravity'
  failures=$((failures + 1))
fi

printf '%s\n' 'MANUAL mở Antigravity trong workspace đích, chạy /skills rồi /mcp và thực hiện smoke test read-only'
[[ "$failures" -eq 0 ]]
