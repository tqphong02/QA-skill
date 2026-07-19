#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
agent=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent=*) agent="${1#*=}"; shift ;;
    --agent) agent="${2:-}"; shift 2 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
done

case "$agent" in
  codex) exec bash "$SCRIPT_DIR/doctor-codex.sh" ;;
  antigravity) exec bash "$SCRIPT_DIR/doctor-antigravity.sh" ;;
  claude)
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
