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
  if verify_installed_skill "$skill"; then
    printf 'PASS skill=%s source_match=true\n' "$skill"
  elif [[ ! -f "$SKILLS_DIR/$skill/SKILL.md" ]]; then
    printf 'FAILED skill_missing=%s expected=%s\n' "$skill" "$SKILLS_DIR/$skill/SKILL.md"
    failures=$((failures + 1))
  else
    printf 'FAILED skill_drift=%s installed=%s\n' "$skill" "$SKILLS_DIR/$skill/SKILL.md"
    failures=$((failures + 1))
  fi
done < <(print_profile_skills "$PROFILE")

while IFS= read -r nested_manifest; do
  [[ -n "$nested_manifest" ]] || continue
  printf 'FAILED nested_skill_active=%s\n' "$nested_manifest"
  failures=$((failures + 1))
done < <(find "$SKILLS_DIR" -mindepth 3 -type f -name 'SKILL.md' -print 2>/dev/null)

while IFS=$'\t' read -r alias canonical; do
  [[ -n "$alias" ]] || continue
  if [[ -e "$SKILLS_DIR/$alias" ]]; then
    printf 'FAILED legacy_skill_active=%s canonical=%s\n' "$alias" "$canonical"
    failures=$((failures + 1))
  fi
done < <(list_legacy_alias_mappings)

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
