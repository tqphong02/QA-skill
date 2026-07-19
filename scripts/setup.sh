#!/usr/bin/env bash
# setup.sh — One-command bootstrap cho QA-skill.
#
# Clone về → chạy 1 lệnh → setup đủ:
#   • Copy profile core hoặc full vào đúng thư mục discovery của Codex, Antigravity hoặc Claude
#   • Cài Node deps (qa-run + playwright-pom-automation)
#   • Cài Python deps (markitdown[all] + openpyxl) dùng prebuilt wheel
#   • Auto-detect AI env (Antigravity / Copilot / Claude Code / standalone)
#   • Tạo config/api_keys.json từ template (nếu standalone)
#   • Verify end-to-end
#
# Usage: ./scripts/setup.sh --agent=codex|antigravity|claude [options]
# Help:  ./scripts/setup.sh --help

set -eo pipefail 2>/dev/null || set -eo  # Git Bash on bash 3.2 may lack pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# ==== Git Bash path helpers ====
# Convert POSIX path → Windows path (vd /c/Users/foo → C:\Users\foo)
to_win_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1" 2>/dev/null || echo "$1"
  else
    echo "$1"
  fi
}
# Convert Windows path → POSIX path (vd C:\Users\foo → /c/Users/foo)
to_posix_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$1" 2>/dev/null || echo "$1"
  else
    echo "$1"
  fi
}
# On Git Bash, $HOME may be POSIX (/c/Users/foo) — used everywhere, don't convert
# But paths that get passed to Python/Node should stay POSIX

# Source lib (also exposes env vars REPO_DIR, etc.)
source "$SCRIPT_DIR/setup_lib.sh"

# ==== Defaults ====
TARGET_AGENT="${QA_SKILL_AGENT:-auto}"
PROFILE="${QA_SKILL_PROFILE:-core}"
SKILLS_DIR="${SKILLS_DIR:-}"
SKIP_DEPS="${SKIP_DEPS:-0}"
DRY_RUN="${DRY_RUN:-0}"
ONLY_SKILLS=""
YES="${YES:-0}"
NO_COLOR="${NO_COLOR:-}"

# ==== Parse flags ====
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-deps)       SKIP_DEPS=1; shift ;;
    --dry-run)         DRY_RUN=1; shift ;;
    --profile=*)       PROFILE="${1#*=}"; shift ;;
    --profile)         PROFILE="${2:-}"; shift 2 ;;
    --only=*)          ONLY_SKILLS="${1#*=}"; shift ;;
    --only)            ONLY_SKILLS="${2:-}"; shift 2 ;;
    --agent=*)         TARGET_AGENT="${1#*=}"; shift ;;
    --agent)           TARGET_AGENT="${2:-}"; shift 2 ;;
    --skills-dir=*)    SKILLS_DIR="${1#*=}"; shift ;;
    --skills-dir)      SKILLS_DIR="${2:-}"; shift 2 ;;
    --yes|-y)          YES=1; shift ;;
    --no-color)        NO_COLOR=1; shift ;;
    -h|--help)         print_help; exit 0 ;;
    *)                 log_err "Unknown flag: $1"; echo "  Try: $0 --help"; exit 1 ;;
  esac
done

TARGET_AGENT=$(resolve_target_agent "$TARGET_AGENT") || exit 1
PROFILE=$(resolve_profile "$PROFILE") || exit 1
if [[ -z "$SKILLS_DIR" ]]; then
  SKILLS_DIR=$(resolve_skills_dir "$TARGET_AGENT") || exit 1
fi

# ==== Trap ====
trap 'rc=$?; if [[ $rc -ne 0 ]] && [[ $rc -ne 1 ]]; then log_err "Setup failed (exit=$rc, line=$LINENO). Try --dry-run để debug."; fi' EXIT

# ==== Print banner ====
print_banner

# ==== Windows-specific warning ====
OS_EARLY=$(detect_os)
if [[ "$OS_EARLY" == "windows-gitbash" ]]; then
  log_warn "Đang chạy trên Git Bash — một số lệnh có thể cần WSL để ổn định 100%"
  log_warn "  Khuyến nghị: cài WSL2 (wsl --install) và chạy setup.sh trong WSL"
  log_warn "  Tạm thời vẫn chạy được, lệnh nào fail sẽ báo rõ để debug"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  log_warn "DRY-RUN MODE — không mutate filesystem"
fi

# ==== Step 1: Detect OS + resolve skill list ====
OS_TYPE=$(detect_os)
log_step "OS detected: $OS_TYPE"

# Parse skill list (also validates --only values)
SKILLS=()
while IFS= read -r line; do
  SKILLS+=("$line")
done < <(resolve_skill_list "$ONLY_SKILLS" "$PROFILE") || exit 1
if [[ ${#SKILLS[@]} -eq 0 ]]; then
  log_err "Không có skill nào để setup"; exit 1
fi

print_plan "${SKILLS[@]}"

# ==== Step 2: Check Python ====
log_step "Checking Python"
PY_VERSION=$(check_python)
warn_if_python_too_old "$PY_VERSION" || true

# ==== Step 3: Check Node ====
log_step "Checking Node"
NODE_VERSION=$(check_node)
warn_if_node_too_old "$NODE_VERSION" || true

# ==== Step 4: Create skills dir ====
log_step "Skills dir: $SKILLS_DIR"
if [[ "$DRY_RUN" -eq 1 ]]; then
  log_dry "mkdir -p $SKILLS_DIR"
elif mkdir -p "$SKILLS_DIR" 2>/dev/null; then
  log_ok "created (or already existed)"
else
  log_err "Không tạo được $SKILLS_DIR — kiểm tra quyền"
  exit 1
fi

# ==== Step 5: Copy skills ====
sync_profile_visibility "$PROFILE" "$ONLY_SKILLS"
log_step "Copying ${#SKILLS[@]} QA skills"
for skill in "${SKILLS[@]}"; do
  copy_skill "$skill" || log_warn "Skill $skill bị skip hoặc fail"
done

# ==== Step 6: Install Node deps ====
if [[ "$SKIP_DEPS" -eq 1 ]]; then
  log_step "Skipping npm install (--skip-deps)"
else
  install_node_deps "${SKILLS[@]}"
fi

# ==== Step 7: Install Python deps ====
if [[ "$SKIP_DEPS" -eq 1 ]]; then
  log_step "Skipping pip install (--skip-deps)"
else
  install_python_deps
fi

# ==== Step 8: Setup AI config ====
setup_ai_config

# ==== Step 9: Verify ====
verify_installation

# ==== Step 10: Summary ====
print_summary "${SKILLS[@]}"

trap - EXIT  # Clear error trap for clean exit
exit 0
