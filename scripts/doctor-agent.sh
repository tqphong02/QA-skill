#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
agent=""
profile="core"
doctor_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent=*) agent="${1#*=}"; shift ;;
    --agent) agent="${2:-}"; shift 2 ;;
    --profile=*) profile="${1#*=}"; shift ;;
    --profile) profile="${2:-}"; shift 2 ;;
    --allow-missing-runtime) doctor_args+=("$1"); shift ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
done

case "$profile" in
  core|full) export QA_SKILL_PROFILE="$profile" ;;
  *) printf 'Profile không hỗ trợ: %s\n' "$profile" >&2; exit 2 ;;
esac

case "$agent" in
  codex)
    [[ "${#doctor_args[@]}" -eq 0 ]] || { printf '%s\n' 'Option --allow-missing-runtime chỉ áp dụng cho antigravity' >&2; exit 2; }
    exec bash "$SCRIPT_DIR/doctor-codex.sh"
    ;;
  antigravity)
    if [[ "${#doctor_args[@]}" -gt 0 ]]; then
      exec bash "$SCRIPT_DIR/doctor-antigravity.sh" "${doctor_args[0]}"
    fi
    exec bash "$SCRIPT_DIR/doctor-antigravity.sh"
    ;;
  claude)
    [[ "${#doctor_args[@]}" -eq 0 ]] || { printf '%s\n' 'Option --allow-missing-runtime chỉ áp dụng cho antigravity' >&2; exit 2; }
    SKILLS_DIR="${SKILLS_DIR:-$HOME/.claude/skills}"
    failures=0
    command -v claude >/dev/null 2>&1 || { printf '%s\n' 'FAILED runtime_missing claude'; failures=1; }
    while IFS= read -r skill; do
      [[ -f "$SKILLS_DIR/$skill/SKILL.md" ]] || { printf 'FAILED skill_missing=%s\n' "$skill"; failures=1; }
    done < <(bash -c 'source "$1/setup_lib.sh"; print_profile_skills "$2"' _ "$SCRIPT_DIR" "$profile")
    [[ "$failures" -eq 0 ]]
    ;;
  *)
    printf '%s\n' 'Usage: doctor-agent.sh --agent=codex|antigravity|claude [--profile=core|full]' >&2
    exit 2
    ;;
esac
