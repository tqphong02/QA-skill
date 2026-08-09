#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/setup_lib.sh"

SKILLS_DIR="${SKILLS_DIR:-$HOME/.agents/skills}"
PROFILE=$(resolve_profile "${QA_SKILL_PROFILE:-full}") || exit 2
failures=0

if command -v codex >/dev/null 2>&1; then
  printf 'PASS runtime codex=%s\n' "$(command -v codex)"
else
  printf '%s\n' 'FAILED runtime_missing codex'
  failures=$((failures + 1))
fi

while IFS= read -r skill; do
  if [[ -f "$SKILLS_DIR/$skill/SKILL.md" ]]; then
    printf 'PASS skill=%s\n' "$skill"
  else
    printf 'FAILED skill_missing=%s expected=%s\n' "$skill" "$SKILLS_DIR/$skill/SKILL.md"
    failures=$((failures + 1))
  fi
done < <(print_profile_skills "$PROFILE")

if command -v codex >/dev/null 2>&1; then
  if codex mcp list >/dev/null 2>&1; then
    printf '%s\n' 'PASS mcp_config_readable'
  else
    printf '%s\n' 'FAILED mcp_config_unreadable'
    failures=$((failures + 1))
  fi
fi

printf '%s\n' 'MANUAL mở phiên Codex mới và xác nhận skill cần dùng xuất hiện trước smoke test MCP read-only'
[[ "$failures" -eq 0 ]]
