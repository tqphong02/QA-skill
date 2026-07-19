#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
agent=""
doctor_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent=*) agent="${1#*=}"; shift ;;
    --agent) agent="${2:-}"; shift 2 ;;
    --allow-missing-runtime) doctor_args+=("$1"); shift ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
done

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
    done < <(bash -c 'source "$1/setup_lib.sh"; printf "%s\n" "${DEFAULT_SKILLS[@]}"' _ "$SCRIPT_DIR")
    [[ "$failures" -eq 0 ]]
    ;;
  *)
    printf '%s\n' 'Usage: doctor-agent.sh --agent=codex|antigravity|claude' >&2
    exit 2
    ;;
esac
