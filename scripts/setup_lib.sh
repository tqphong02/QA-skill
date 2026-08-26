#!/usr/bin/env bash
# setup_lib.sh — Helper functions cho scripts/setup.sh
# Tách riêng để dễ test độc lập từng function nếu cần.
# KHÔNG chạy trực tiếp — luôn được source từ setup.sh.

# ==== Logging (tput-based, fallback plain text) ====
_setup_color() {
  if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]] && command -v tput >/dev/null 2>&1; then
    C_OK="$(tput setaf 2)"; C_WARN="$(tput setaf 3)"; C_ERR="$(tput setaf 1)"
    C_STEP="$(tput setaf 6)"; C_BOLD="$(tput bold)"; C_RST="$(tput sgr0)"
    return 0
  fi
  C_OK=""; C_WARN=""; C_ERR=""; C_STEP=""; C_BOLD=""; C_RST=""
}

_setup_color

log_info() { printf '  %s\n' "$*"; }
log_ok()   { printf '  %s✓%s %s\n' "$C_OK" "$C_RST" "$*"; }
log_warn() { printf '  %s!%s %s\n' "$C_WARN" "$C_RST" "$*" >&2; }
log_err()  { printf '  %s✗%s %s\n' "$C_ERR" "$C_RST" "$*" >&2; }
log_step() { printf '\n%s[Step]%s %s\n' "$C_STEP" "$C_RST" "$*"; }
log_dry()  { printf '  %s[DRY-RUN]%s would: %s\n' "$C_WARN" "$C_RST" "$*"; }

# ==== Banner ====
print_banner() {
  printf '%s' "$C_BOLD"
  cat <<'EOF'

  ┌──────────────────────────────────────────┐
  │      QA-skill setup (1 lệnh setup)       │
  │  QA · Plane · Drive · Testcase · POM     │
  └──────────────────────────────────────────┘
EOF
  printf '%s\n\n' "$C_RST"
}

# ==== Help ====
print_help() {
  cat <<'EOF'
Usage: ./scripts/setup.sh [options]

Setup QA, Security Engineering và MCP integration skill theo profile. Mặc định dùng full để publish mọi top-level skill mới.

Options:
  --skip-deps           Chỉ copy skills + setup AI config; bỏ qua npm install / pip install
  --skip-mcp-setup      Không tự cấu hình MCP cho integration skill đã chọn
  --dry-run             In mọi command sẽ chạy, KHÔNG mutate filesystem
  --profile=<name>      core hoặc full; mặc định full
  --only=<skill[,..]>   Chỉ setup 1 hoặc nhiều skill (vd: --only=dynamic-web-exploratory,support-document-conversion)
  --agent=<name>        codex, antigravity hoặc claude; auto chỉ chạy khi detect đúng một host
  --skills-dir=<path>   Override thư mục discovery do --agent chọn
  --yes / -y            Non-interactive (default = backup khi xung đột)
  --no-color            Tắt màu output
  --help / -h           In trợ giúp này

Environment variables:
  QA_SKILL_AGENT        Giá trị mặc định cho --agent
  QA_SKILL_PROFILE      Giá trị mặc định cho --profile
  SKILLS_DIR            Override thư mục discovery
  SKIP_DEPS=1           Tương đương --skip-deps
  SKIP_MCP_SETUP=1      Tương đương --skip-mcp-setup
  NO_COLOR=1            Tắt màu

Examples:
  ./scripts/setup.sh --agent=codex --profile=full --yes
  ./scripts/setup.sh --agent=antigravity --profile=full --yes
  ./scripts/setup.sh --agent=claude --profile=full --yes
  ./scripts/setup.sh --agent=antigravity --profile=full --yes
  ./scripts/setup.sh --agent=codex --skip-deps --yes
  ./scripts/setup.sh --agent=antigravity --dry-run
  ./scripts/setup.sh --agent=claude --only=support-document-conversion --yes
  ./scripts/setup.sh --agent=codex --skills-dir=/custom/path --yes
EOF
}

# ==== Agent target resolution ====
resolve_target_agent() {
  local requested="${1:-auto}"
  case "$requested" in
    codex|antigravity|claude)
      printf '%s\n' "$requested"
      return 0
      ;;
    auto)
      local detected=()
      command -v codex >/dev/null 2>&1 && detected+=(codex)
      if command -v agy >/dev/null 2>&1 || [[ -d "/Applications/Antigravity IDE.app" ]] || [[ -d "/Applications/Antigravity.app" ]]; then
        detected+=(antigravity)
      fi
      command -v claude >/dev/null 2>&1 && detected+=(claude)
      if [[ ${#detected[@]} -eq 1 ]]; then
        printf '%s\n' "${detected[0]}"
        return 0
      fi
      if [[ ${#detected[@]} -eq 0 ]]; then
        log_err "Không detect được AI host; dùng --agent=codex|antigravity|claude"
      else
        log_err "Detect nhiều AI host: ${detected[*]}; phải chọn --agent rõ ràng"
      fi
      return 1
      ;;
    *)
      log_err "Agent không hỗ trợ: $requested"
      log_err "Giá trị hợp lệ: codex, antigravity, claude, auto"
      return 1
      ;;
  esac
}

resolve_skills_dir() {
  case "$1" in
    codex)
      printf '%s\n' "$HOME/.agents/skills"
      ;;
    antigravity)
      printf '%s\n' "$HOME/.gemini/config/skills"
      ;;
    claude)
      printf '%s\n' "$HOME/.claude/skills"
      ;;
    *)
      log_err "Không resolve được skills dir cho agent: $1"
      return 1
      ;;
  esac
}

# ==== OS detect ====
detect_os() {
  case "$(uname -s 2>/dev/null)" in
    Darwin)        echo "macos" ;;
    Linux)
      if grep -qi 'microsoft\|WSL' /proc/version 2>/dev/null; then echo "wsl"
      else echo "linux"; fi ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows-gitbash" ;;
    *) echo "unsupported" ;;
  esac
}

# ==== Python check (no abort — print version + warn) ====
# Returns: python_version string ("3.11.9" / "9.9" / "")
check_python() {
  local candidates=("python3.12" "python3.11" "python3.10" "python3" "python" "/usr/bin/python3" "/usr/local/bin/python3")
  for py in "${candidates[@]}"; do
    if command -v "$py" >/dev/null 2>&1; then
      local v
      v=$("$py" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")' 2>/dev/null || echo "")
      if [[ -n "$v" ]]; then echo "$v"; return 0; fi
    fi
  done
  echo ""
}

warn_if_python_too_old() {
  local v="$1"
  if [[ -z "$v" ]]; then
    log_warn "Python 3 NOT found. support-document-conversion + support-testcase-authoring + static-requirements-analysis sẽ KHÔNG chạy được."
    local os
    os=$(detect_os)
    case "$os" in
      windows-gitbash)
        log_warn "  Windows: tick 'Add Python to PATH' khi cài từ python.org"
        log_warn "  Hoặc: winget install Python.Python.3.11" ;;
      wsl|linux)
        log_warn "  sudo apt install python3.11  (Debian/Ubuntu)" ;;
      macos)
        log_warn "  Tải từ https://python.org/downloads (>= 3.10)" ;;
      *) log_warn "  Tải từ https://python.org/downloads (>= 3.10)" ;;
    esac
    return 1
  fi
  local major minor
  major=$(echo "$v" | cut -d. -f1)
  minor=$(echo "$v" | cut -d. -f2)
  if [[ "$major" -lt 3 ]] || { [[ "$major" -eq 3 ]] && [[ "$minor" -lt 10 ]]; }; then
    log_warn "Python $v found (< 3.10). support-document-conversion cần >= 3.10."
    log_warn "  Tải Python 3.10+ từ https://python.org/downloads"
    return 1
  fi
  log_ok "Python $v"
  return 0
}

# ==== Node check ====
# Returns: node version string
check_node() {
  if command -v node >/dev/null 2>&1; then
    node -v 2>/dev/null | sed 's/^v//' || echo ""
  else
    echo ""
  fi
}

warn_if_node_too_old() {
  local v="$1"
  if [[ -z "$v" ]]; then
    log_warn "Node.js NOT found. dynamic-web-exploratory + static-requirements-analysis sẽ KHÔNG chạy được."
    local os
    os=$(detect_os)
    case "$os" in
      windows-gitbash)
        log_warn "  Windows: winget install OpenJS.NodeJS.LTS"
        log_warn "  Hoặc tải từ https://nodejs.org (>= 20, tick add to PATH)" ;;
      wsl|linux)
        log_warn "  Cài qua nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash && nvm install 20" ;;
      macos)
        log_warn "  brew install node@20 hoặc tải từ https://nodejs.org" ;;
      *) log_warn "  Tải từ https://nodejs.org (>= 20)" ;;
    esac
    return 1
  fi
  local major
  major=$(echo "$v" | cut -d. -f1)
  if [[ "$major" -lt 20 ]]; then
    log_warn "Node $v found (< 20). dynamic-web-exploratory + static-requirements-analysis cần >= 20."
    log_warn "  'brew install node@20' hoặc 'nvm install 20'"
    return 1
  fi
  log_ok "Node $v"
  return 0
}

# ==== Skills resolution ====
CORE_SKILLS=("dynamic-web-exploratory" "support-testcase-authoring" "dynamic-web-automation" "support-document-conversion" "static-requirements-analysis" "dynamic-security-pentest" "integration-plane" "integration-google-drive" "integration-github" "integration-postman")
SPECIALIZED_SKILLS=("dynamic-data-quality" "dynamic-ai-evaluation" "hybrid-accessibility" "dynamic-performance" "hybrid-api-contract" "dynamic-mobile" "hybrid-source-coverage" "adapter-browser-session" "hybrid-ui-ux-review" "governance-release-quality" "static-supply-chain-security" "dynamic-resilience" "dynamic-compatibility")
FULL_SKILLS=("${CORE_SKILLS[@]}" "${SPECIALIZED_SKILLS[@]}")
DEFAULT_SKILLS=("${FULL_SKILLS[@]}")
RETIRED_SKILLS=("jmeter-qa")

resolve_profile() {
  local requested="${1:-full}"
  case "$requested" in
    core|full)
      printf '%s\n' "$requested"
      ;;
    *)
      log_err "Profile không hỗ trợ: $requested"
      log_err "Giá trị hợp lệ: core, full"
      return 1
      ;;
  esac
}

discover_repo_skills() {
  if command -v node >/dev/null 2>&1 && [[ -f "$REPO_DIR/scripts/skill-registry-cli.mjs" ]]; then
    node "$REPO_DIR/scripts/skill-registry-cli.mjs" list "" "$REPO_DIR" && return 0
  fi
  local skill_file
  while IFS= read -r skill_file; do
    [[ -f "$skill_file" ]] || continue
    sed -n 's/^name:[[:space:]]*//p' "$skill_file" | head -1
  done < <(skill_manifest_files)
}

skill_manifest_files() {
  find "$REPO_DIR" -mindepth 3 -maxdepth 3 -type f -name SKILL.md \
    -not -path '*/vendor/*' -not -path '*/node_modules/*' | sort
}

skill_repo_path() {
  local requested="$1"
  if command -v node >/dev/null 2>&1 && [[ -f "$REPO_DIR/scripts/skill-registry-cli.mjs" ]]; then
    local registry_path
    if registry_path=$(node "$REPO_DIR/scripts/skill-registry-cli.mjs" path "$requested" "$REPO_DIR"); then
      printf '%s\n' "$registry_path"
      return 0
    fi
  fi
  local skill_file
  local skill_id
  local aliases
  while IFS= read -r skill_file; do
    [[ -f "$skill_file" ]] || continue
    skill_id=$(sed -n 's/^name:[[:space:]]*//p' "$skill_file" | head -1)
    aliases=$(sed -n 's/^legacy_aliases:[[:space:]]*//p' "$skill_file" | head -1)
    if [[ "$requested" == "$skill_id" || "$requested" == "$aliases" ]]; then
      dirname "$skill_file"
      return 0
    fi
  done < <(skill_manifest_files)
  return 1
}

canonical_skill_id() {
  local requested="$1"
  if command -v node >/dev/null 2>&1 && [[ -f "$REPO_DIR/scripts/skill-registry-cli.mjs" ]]; then
    local registry_id
    if registry_id=$(node "$REPO_DIR/scripts/skill-registry-cli.mjs" id "$requested" "$REPO_DIR"); then
      printf '%s\n' "$registry_id"
      return 0
    fi
  fi
  local skill_file
  local skill_id
  local aliases
  while IFS= read -r skill_file; do
    [[ -f "$skill_file" ]] || continue
    skill_id=$(sed -n 's/^name:[[:space:]]*//p' "$skill_file" | head -1)
    aliases=$(sed -n 's/^legacy_aliases:[[:space:]]*//p' "$skill_file" | head -1)
    if [[ "$requested" == "$skill_id" || "$requested" == "$aliases" ]]; then
      printf '%s\n' "$skill_id"
      return 0
    fi
  done < <(skill_manifest_files)
  return 1
}

print_profile_skills() {
  case "$1" in
    core) printf '%s\n' "${CORE_SKILLS[@]}" ;;
    full) discover_repo_skills ;;
    *) log_err "Không resolve được profile: $1"; return 1 ;;
  esac
}

resolve_skill_list() {
  local only="$1"
  local profile="${2:-core}"
  if [[ -z "$only" ]]; then
    print_profile_skills "$profile"
    return 0
  fi
  local IFS=','
  local req=($only)
  local valid=()
  for s in "${req[@]}"; do
    local canonical
    if canonical=$(canonical_skill_id "$s"); then
      valid+=("$canonical")
    else
      log_err "Skill không tồn tại trong repo: $s (đã bỏ qua)"
    fi
  done
  if [[ ${#valid[@]} -eq 0 ]]; then
    log_err "--only=$only không match skill nào"
    return 1
  fi
  printf '%s\n' "${valid[@]}"
}

sync_profile_visibility() {
  local profile="$1"
  local only="${2:-}"
  [[ "$profile" == "core" ]] || return 0
  [[ -z "$only" ]] || return 0

  local stash_dir
  stash_dir="$(dirname "$SKILLS_DIR")/qa-skill-disabled"
  local stamp
  stamp=$(date '+%Y%m%d%H%M%S')
  local moved=0

  for skill in "${SPECIALIZED_SKILLS[@]}"; do
    local src="$SKILLS_DIR/$skill"
    [[ -e "$src" ]] || continue
    local dst="$stash_dir/${skill}-${stamp}"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      log_dry "move $src → $dst"
      moved=$((moved + 1))
      continue
    fi
    mkdir -p "$(dirname "$dst")"
    if mv "$src" "$dst"; then
      log_ok "disabled $skill → $dst"
      moved=$((moved + 1))
    else
      log_err "Không disable được $skill"
      return 1
    fi
  done

  if [[ "$moved" -gt 0 ]]; then
    log_info "  Profile core đã đưa $moved skill chuyên sâu ra ngoài discovery"
    log_info "  Chạy --profile=full để cài lại khi cần"
  fi
}

legacy_aliases_for_skill() {
  local requested="$1"
  if command -v node >/dev/null 2>&1 && [[ -f "$REPO_DIR/scripts/skill-registry-cli.mjs" ]]; then
    node "$REPO_DIR/scripts/skill-registry-cli.mjs" aliases "$requested" "$REPO_DIR"
    return $?
  fi
  return 1
}

list_legacy_alias_mappings() {
  if command -v node >/dev/null 2>&1 && [[ -f "$REPO_DIR/scripts/skill-registry-cli.mjs" ]]; then
    node "$REPO_DIR/scripts/skill-registry-cli.mjs" list-aliases "" "$REPO_DIR"
    return $?
  fi
  return 1
}

retire_legacy_skills() {
  local canonical_skills=("$@")
  local stash_dir
  stash_dir="$(dirname "$SKILLS_DIR")/qa-skill-backups"
  local stamp
  stamp=$(date '+%Y%m%d%H%M%S')

  for skill in "${RETIRED_SKILLS[@]}"; do
    local src="$SKILLS_DIR/$skill"
    [[ -e "$src" ]] || continue
    local dst="$stash_dir/$stamp/retired/${skill}-merged-into-dynamic-performance"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      log_dry "retire $src → $dst"
      continue
    fi
    mkdir -p "$(dirname "$dst")"
    if mv "$src" "$dst"; then
      log_ok "retired $skill → $dst"
    else
      log_err "Không retire được legacy skill $skill"
      return 1
    fi
  done

  local canonical
  local alias
  for canonical in "${canonical_skills[@]}"; do
    while IFS= read -r alias; do
      [[ -n "$alias" ]] || continue
      local src="$SKILLS_DIR/$alias"
      [[ -e "$src" ]] || continue
      local dst="$stash_dir/$stamp/legacy-aliases/${alias}-to-${canonical}"
      if [[ "$DRY_RUN" -eq 1 ]]; then
        log_dry "migrate legacy alias $src → $dst"
        continue
      fi
      mkdir -p "$(dirname "$dst")"
      if mv "$src" "$dst"; then
        log_ok "migrated legacy alias $alias → $canonical (backup: $dst)"
      else
        log_err "Không migrate được legacy alias $alias"
        return 1
      fi
    done < <(legacy_aliases_for_skill "$canonical")
  done
}

verify_installed_skill() {
  local skill="$1"
  local installed="$SKILLS_DIR/$skill/SKILL.md"
  local source_root
  source_root=$(skill_repo_path "$skill") || return 1
  local source="$source_root/SKILL.md"
  [[ -f "$installed" ]] || return 2
  cmp -s "$source" "$installed"
}

dependency_manifests_match() {
  local source_root="$1"
  local installed_root="$2"
  [[ -f "$source_root/package.json" && -f "$installed_root/package.json" ]] || return 1
  cmp -s "$source_root/package.json" "$installed_root/package.json" || return 1
  if [[ -f "$source_root/package-lock.json" || -f "$installed_root/package-lock.json" ]]; then
    [[ -f "$source_root/package-lock.json" && -f "$installed_root/package-lock.json" ]] || return 1
    cmp -s "$source_root/package-lock.json" "$installed_root/package-lock.json" || return 1
  fi
}

# ==== Copy skill (with excludes) ====
copy_skill() {
  local skill="$1"
  local src
  local dst="$SKILLS_DIR/$skill"

  if ! src=$(skill_repo_path "$skill"); then
    log_err "Không resolve được source cho skill: $skill"
    return 1
  fi

  if [[ ! -d "$src" ]]; then
    log_err "Source không tồn tại: $src"
    return 1
  fi

  local dependency_cache=""
  if [[ -d "$dst/node_modules" ]] && dependency_manifests_match "$src" "$dst"; then
    local dependency_cache_root
    dependency_cache_root="$(dirname "$SKILLS_DIR")/qa-skill-dependency-cache"
    dependency_cache="$dependency_cache_root/${skill}-$$"
    if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
      log_dry "reuse unchanged node_modules for $skill"
      dependency_cache=""
    else
      mkdir -p "$dependency_cache_root"
      mv "$dst/node_modules" "$dependency_cache"
    fi
  fi

  if [[ -e "$dst" ]]; then
    if ! resolve_skill_conflict "$dst"; then
      if [[ -n "$dependency_cache" && -d "$dependency_cache" && -d "$dst" ]]; then
        mv "$dependency_cache" "$dst/node_modules"
      fi
      return 1
    fi
  fi

  if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
    log_dry "cp -R (with excludes) $src $dst"
    return 0
  fi

  mkdir -p "$dst"
  # Detect Windows-style src to make sure $dst exists as a dir already
  # rsync if available (macOS có sẵn, Linux thường có), fallback cp
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude='node_modules' --exclude='evidence' --exclude='qa-knowledge' \
      --exclude='vendor' --exclude='tests' --exclude='.env' \
      --exclude='auth.json' --exclude='.DS_Store' --exclude='__pycache__' \
      --exclude='*.pyc' --exclude='dist' --exclude='build' \
      --exclude='*.bak' --exclude='*.tmp' \
      "$src/" "$dst/"
  else
    # Fallback: copy then cleanup (works on Git Bash MINGW/MSYS too,
    # since 'cp -R src/.' is non-POSIX; we use 'cp -R src dst').
    cp -R "$src"/* "$dst"/ 2>/dev/null || cp -R "$src" "$dst"
    # Cleanup excludes (best-effort)
    for exclude in node_modules evidence qa-knowledge vendor tests '.env' auth.json '.DS_Store' __pycache__; do
      rm -rf "$dst/$exclude" 2>/dev/null || true
    done
    find "$dst" -name '*.pyc' -delete 2>/dev/null || true
  fi

  # Only the selected top-level skill is public. Bundled examples, templates or
  # third-party sources must not register additional user-selectable skills.
  find "$dst" -mindepth 2 -type f -name 'SKILL.md' -delete 2>/dev/null || true
  if [[ -n "$dependency_cache" && -d "$dependency_cache" ]]; then
    mv "$dependency_cache" "$dst/node_modules"
    quarantine_nested_skill_manifests "$dst" || return 1
    if [[ "${SKIP_DEPS:-0}" -ne 1 ]]; then
      : > "$dst/.qa-skill-deps-reused"
    fi
  fi
  log_ok "$skill → $dst"
}

resolve_skill_conflict() {
  local dst="$1"
  local default_action="b"
  if [[ "${YES:-0}" -eq 1 ]]; then
    default_action="b"
  fi

  local choice
  if [[ -t 0 ]] && [[ "${YES:-0}" -eq 0 ]]; then
    printf '\n  %s đã tồn tại tại %s\n' "$(basename "$dst")" "$dst"
    printf '  Chọn: [o]verwrite (đè), [b]ackup (giữ + backup cũ), [s]kip: '
    read -r choice
    choice="${choice:-$default_action}"
  else
    choice="$default_action"
    log_info "$dst đã có — auto backup (--yes mode)"
  fi

  case "$choice" in
    o|O)
      log_info "  → overwrite $dst"
      rm -rf "$dst"
      ;;
    b|B)
      local ts
      ts=$(date +%Y%m%d-%H%M%S)
      local backup_root
      backup_root="$(dirname "$SKILLS_DIR")/qa-skill-backups/$ts"
      local bak="$backup_root/$(basename "$dst")"
      if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
        log_dry "mv $dst $bak"
      else
        mkdir -p "$backup_root"
        mv "$dst" "$bak"
        log_info "  → backed up to $bak"
      fi
      ;;
    s|S)
      log_info "  → skip $dst"
      return 1  # Signal "skip"
      ;;
    *)
      log_warn "Lựa chọn không hợp lệ '$choice' — skip"
      return 1
      ;;
  esac
  return 0
}

# ==== Install Node deps ====
install_node_deps() {
  local skills=("$@")
  if [[ -z "${NODE_VERSION:-}" ]] || [[ -z "$NODE_VERSION" ]]; then
    log_warn "Skipping Node deps (Node không khả dụng)"
    return 0
  fi
  for skill in "${skills[@]}"; do
    local skill_path="$SKILLS_DIR/$skill"
    if [[ -f "$skill_path/package.json" ]] || { [[ "${DRY_RUN:-0}" -eq 1 ]] && [[ -f "$REPO_DIR/$skill/package.json" ]]; }; then
      if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
        log_dry "cd $skill_path && npm install --no-audit --no-fund"
      elif [[ -f "$skill_path/.qa-skill-deps-reused" && -d "$skill_path/node_modules" ]]; then
        rm -f "$skill_path/.qa-skill-deps-reused"
        log_ok "$skill: reused node_modules (dependency manifests unchanged)"
        quarantine_nested_skill_manifests "$skill_path" || return 1
      else
        log_step "npm install trong $skill"
        if (cd "$skill_path" && npm install --no-audit --no-fund --loglevel=error); then
          log_ok "$skill: npm install OK"
        else
          log_err "$skill: npm install fail"
          return 1
        fi
        quarantine_nested_skill_manifests "$skill_path" || return 1
      fi
    else
      log_info "$skill: không có package.json — skip npm"
    fi
  done
}

# Dependency packages such as playwright-core ship their own Agent Skill
# documents. They are useful vendor resources but must not become public
# QA-skill entrypoints when a host recursively scans the installed tree.
quarantine_nested_skill_manifests() {
  local skill_root="$1"
  [[ -d "$skill_root" ]] || return 0
  local manifest target count=0
  while IFS= read -r -d '' manifest; do
    target="${manifest%/SKILL.md}/SKILL.dependency-resource.md"
    if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
      log_dry "quarantine nested dependency manifest $manifest → $target"
    else
      mv "$manifest" "$target" || return 1
      count=$((count + 1))
    fi
  done < <(find "$skill_root" -mindepth 2 -type f -name 'SKILL.md' -print0)
  if [[ "$count" -gt 0 ]]; then
    log_ok "$count nested dependency skill manifest(s) quarantined in $(basename "$skill_root")"
  fi
}

# ==== Install Python deps ====
requires_python_packages() {
  local skill
  for skill in "$@"; do
    [[ "$skill" == "integration-postman" ]] || return 0
  done
  return 1
}

install_python_deps() {
  local py_bin=""
  for py in python3.11 python3.12 python3.10 python3 python "/usr/bin/python3"; do
    if command -v "$py" >/dev/null 2>&1; then
      local v
      v=$("$py" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "0.0")
      local maj min
      maj=$(echo "$v" | cut -d. -f1); min=$(echo "$v" | cut -d. -f2)
      if [[ "$maj" -ge 3 ]] && [[ "$min" -ge 10 ]]; then py_bin="$py"; break; fi
    fi
  done

  if [[ -z "$py_bin" ]]; then
    log_warn "Skipping Python deps (không có Python 3.10+)"
    return 0
  fi

  local os
  os=$(detect_os)
  local pip_cmd=("$py_bin" "-m" "pip" "install" "--user" "--quiet" "--only-binary=:all:")
  # Windows + PEP 668 + pip from python.org thường cần --break-system-packages
  # hoặc dùng venv. Git Bash user-friendly hơn nếu dùng --break-system-packages.
  local pip_break=""
  if [[ "$os" == "windows-gitbash" ]]; then
    pip_break="--break-system-packages"
    pip_cmd+=("$pip_break")
  fi

  if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
    log_dry "${pip_cmd[*]} 'markitdown[all]' openpyxl PyYAML google-auth google-auth-oauthlib google-api-python-client"
    return 0
  fi

  local py_ver
  py_ver=$("$py_bin" -c 'import sys;print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")')
  log_step "pip install QA-skill Python dependencies (Python $py_ver$([ -n "$pip_break" ] && echo " + $pip_break"))"

  # Retry without --break-system-packages nếu user tự cấu hình PEP 668 với override
  if "${pip_cmd[@]}" "markitdown[all]" 2>&1 | tail -3 \
     && ("$py_bin" -m pip install --user --quiet --only-binary=:all: openpyxl PyYAML google-auth google-auth-oauthlib google-api-python-client 2>&1 | tail -3 \
         || "$py_bin" -m pip install --user --quiet --only-binary=:all: --break-system-packages openpyxl PyYAML google-auth google-auth-oauthlib google-api-python-client 2>&1 | tail -3); then
    log_ok "Python deps OK"
  else
    log_warn "pip install fail. Thử:"
    log_warn "  1. Kiểm tra network"
    log_warn "  2. Trên Windows: dùng venv: 'python -m venv .venv && source .venv/Scripts/activate' trước"
    log_warn "  3. Hoặc chạy lại với --skip-deps để bỏ qua phần này"
  fi
}

# ==== AI env detect (mirror ai_provider.py:detect_environment) ====
detect_ai_env() {
  if [[ -n "${ANTIGRAVITY_API_KEY:-}" ]] || [[ -d "/Applications/Antigravity IDE.app" ]] || [[ -d "/Applications/Antigravity.app" ]]; then
    echo "antigravity"
  elif [[ -n "${COPILOT_PRO:-}" ]] || [[ -n "${GITHUB_COPILOT_TOKEN:-}" ]]; then
    echo "copilot_pro"
  elif [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    echo "claude_code"
  else
    echo "standalone"
  fi
}

# ==== Setup AI config ====
setup_ai_config() {
  if [[ -n "${TARGET_AGENT:-}" ]] && [[ "$TARGET_AGENT" != "auto" ]]; then
    log_step "AI host: $TARGET_AGENT"
    log_ok "Dùng model và authentication của $TARGET_AGENT; không tạo API key thay mặt người dùng"
    return 0
  fi
  local env_type
  env_type=$(detect_ai_env)
  log_step "AI provider detect: $env_type"

  case "$env_type" in
    antigravity)
      log_ok "Antigravity detected — không cần API key"
      if [[ -d "/Applications/Antigravity IDE.app" ]]; then
        log_info "  (via /Applications/Antigravity IDE.app)"
      elif [[ -d "/Applications/Antigravity.app" ]]; then
        log_info "  (via /Applications/Antigravity.app)"
      else
        log_info "  (via \$ANTIGRAVITY_API_KEY)"
      fi
      ;;
    copilot_pro)
      log_ok "GitHub Copilot Pro detected — không cần API key"
      ;;
    claude_code)
      log_ok "Claude Code CLI detected — key đã có sẵn"
      ;;
    standalone)
      log_warn "Standalone mode — cần API key cho AI model"
      if [[ -f "$REPO_DIR/config/api_keys.json" ]]; then
        log_ok "config/api_keys.json đã tồn tại"
      else
        if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
          log_dry "cp $REPO_DIR/config/api_keys.example.json $REPO_DIR/config/api_keys.json"
        else
          cp "$REPO_DIR/config/api_keys.example.json" "$REPO_DIR/config/api_keys.json"
          chmod 600 "$REPO_DIR/config/api_keys.json"
          log_ok "Đã tạo config/api_keys.json (chmod 600)"
          log_warn "  ⚠️  Edit file để paste API key thật:"
          log_info "     nano $REPO_DIR/config/api_keys.json"
        fi
      fi
      ;;
  esac
}

# ==== Selected MCP integrations ====
setup_selected_integrations() {
  local skills=("$@")
  local has_postman=0
  local has_mobile=0
  local has_web_exploratory=0
  local skill
  for skill in "${skills[@]}"; do
    [[ "$skill" == "integration-postman" ]] && has_postman=1
    [[ "$skill" == "dynamic-mobile" ]] && has_mobile=1
    [[ "$skill" == "dynamic-web-exploratory" ]] && has_web_exploratory=1
  done
  if [[ "$has_postman" -ne 1 ]] && [[ "$has_mobile" -ne 1 ]] && [[ "$has_web_exploratory" -ne 1 ]]; then
    return 0
  fi

  if [[ "${SKIP_MCP_SETUP:-0}" -eq 1 ]]; then
    log_warn "Skipping selected MCP configuration (--skip-mcp-setup)"
    return 0
  fi

  local py_bin=""
  local py
  for py in python3.11 python3.12 python3.10 python3 python; do
    command -v "$py" >/dev/null 2>&1 && { py_bin="$py"; break; }
  done

  if [[ "$has_mobile" -eq 1 ]] && [[ "${TARGET_AGENT:-}" == "antigravity" ]]; then
    log_step "Appium MCP bootstrap"
    if [[ -z "$py_bin" ]]; then
      log_err "Không có Python để cấu hình Appium MCP"
      return 1
    fi
    if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
      local mobile_root
      mobile_root=$(skill_repo_path "dynamic-mobile") || {
        log_err "Không resolve được source cho dynamic-mobile từ skill registry"
        return 1
      }
      mobile_bootstrap="$mobile_root/scripts/configure-appium-mcp.py"
      "$py_bin" "$mobile_bootstrap" --agent antigravity --dry-run || return 1
    else
      local mobile_bootstrap="$SKILLS_DIR/dynamic-mobile/scripts/configure-appium-mcp.py"
      "$py_bin" "$mobile_bootstrap" --agent antigravity || return 1
    fi
  fi

  if [[ "$has_web_exploratory" -eq 1 ]] && [[ "${TARGET_AGENT:-}" == "antigravity" ]]; then
    log_step "Playwright MCP browser-observability bootstrap"
    if [[ -z "$py_bin" ]]; then
      log_err "Không có Python để cấu hình Playwright MCP"
      return 1
    fi
    if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
      local browser_root
      browser_root=$(skill_repo_path "dynamic-web-exploratory") || {
        log_err "Không resolve được source cho dynamic-web-exploratory từ skill registry"
        return 1
      }
      browser_bootstrap="$browser_root/scripts/helpers/configure-browser-mcp.py"
      "$py_bin" "$browser_bootstrap" --agent antigravity --dry-run || return 1
    else
      local browser_bootstrap="$SKILLS_DIR/dynamic-web-exploratory/scripts/helpers/configure-browser-mcp.py"
      "$py_bin" "$browser_bootstrap" --agent antigravity || return 1
    fi
  fi

  [[ "$has_postman" -eq 1 ]] || return 0

  log_step "Postman MCP bootstrap"

  case "${TARGET_AGENT:-}" in
    antigravity|codex) ;;
    *)
      log_warn "Postman skill đã cài; MCP auto-setup chưa hỗ trợ agent ${TARGET_AGENT:-unknown}"
      return 0
      ;;
  esac

  if [[ -z "$py_bin" ]]; then
    log_err "Không có Python để cấu hình Postman MCP"
    return 1
  fi

  if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
    local postman_root
    postman_root=$(skill_repo_path "integration-postman") || {
      log_err "Không resolve được source cho integration-postman từ skill registry"
      return 1
    }
    bootstrap="$postman_root/scripts/bootstrap.py"
    runner="$postman_root/scripts/runner.py"
    "$py_bin" "$bootstrap" --agent="$TARGET_AGENT" --dry-run || return 1
    if [[ "${SKIP_DEPS:-0}" -eq 1 ]]; then
      log_warn "Postman CLI/Newman không được auto-install do --skip-deps"
    else
      log_dry "$py_bin $runner doctor"
    fi
  else
    local bootstrap="$SKILLS_DIR/integration-postman/scripts/bootstrap.py"
    local runner="$SKILLS_DIR/integration-postman/scripts/runner.py"
    "$py_bin" "$bootstrap" --agent="$TARGET_AGENT" || return 1
    if [[ "${SKIP_DEPS:-0}" -eq 1 ]]; then
      log_warn "Postman CLI/Newman không được auto-install do --skip-deps"
    else
      "$py_bin" "$runner" doctor || return 1
    fi
  fi
}

# ==== Verify ====
verify_installation() {
  log_step "Verify"
  # 0. Discovery integrity: one canonical copy, byte-identical SKILL contract,
  # and no migrated alias left active.
  local skill
  if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
    for skill in "${SKILLS[@]}"; do
      log_dry "verify canonical source parity for $skill"
    done
  else
    for skill in "${SKILLS[@]}"; do
      if verify_installed_skill "$skill"; then
        log_ok "$skill canonical source parity"
      else
        log_err "$skill install missing or drifted from repository source"
        return 1
      fi
      local nested_manifest
      nested_manifest=$(find "$SKILLS_DIR/$skill" -mindepth 2 -type f -name 'SKILL.md' -print -quit 2>/dev/null || true)
      if [[ -n "$nested_manifest" ]]; then
        log_err "$skill exposes nested dependency skill: $nested_manifest"
        return 1
      fi
    done
    local canonical alias
    for canonical in "${LEGACY_MIGRATION_SKILLS[@]}"; do
      while IFS= read -r alias; do
        [[ -n "$alias" ]] || continue
        if [[ -e "$SKILLS_DIR/$alias" ]]; then
          log_err "Legacy alias vẫn active: $alias → $canonical"
          return 1
        fi
      done < <(legacy_aliases_for_skill "$canonical")
    done
  fi

  # 1. AI provider status (works as long as python3 anywhere)
  local py_bin=""
  for py in python3.11 python3.12 python3.10 python3 python; do
    command -v "$py" >/dev/null 2>&1 && { py_bin="$py"; break; }
  done
  if [[ -n "$py_bin" ]] && [[ -f "$REPO_DIR/scripts/ai_provider.py" ]] && [[ -z "${TARGET_AGENT:-}" || "$TARGET_AGENT" == "auto" ]]; then
    if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
      log_dry "$py_bin $REPO_DIR/scripts/ai_provider.py"
    else
      "$py_bin" "$REPO_DIR/scripts/ai_provider.py" 2>&1 | head -20 || true
    fi
  fi

  # 2. Python deps smoke
  if [[ -n "$py_bin" ]] && requires_python_packages "${SKILLS[@]}"; then
    if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
      log_dry "$py_bin -c 'import openpyxl, markitdown, yaml'"
    else
      if "$py_bin" -c "import openpyxl; import markitdown; import yaml" 2>/dev/null; then
        log_ok "Python deps (openpyxl + markitdown + PyYAML)"
      else
        log_warn "Python deps thiếu — chạy lại không --skip-deps"
      fi
    fi
  fi

  # 3. Node smoke
  if command -v node >/dev/null 2>&1; then
    local qa_run_tdata="$SKILLS_DIR/dynamic-web-exploratory/lib/tdata.mjs"
    if [[ -f "$qa_run_tdata" ]]; then
      if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
        log_dry "node -e '<pathToFileURL import smoke>' '$qa_run_tdata' (tdata)"
      else
        local qa_run_tdata_native
        qa_run_tdata_native=$(to_win_path "$qa_run_tdata")
        if node -e "import('node:url').then(({ pathToFileURL }) => import(pathToFileURL(process.argv[1]).href)).then(m => console.log('  dynamic-web-exploratory tdata: ' + m.tdata('setup','smoke')))" "$qa_run_tdata_native" 2>/dev/null; then
          log_ok "Node deps (dynamic-web-exploratory/lib/tdata.mjs)"
        else
          log_warn "dynamic-web-exploratory tdata load fail — kiểm tra cd dynamic-web-exploratory && npm install"
        fi
      fi
    fi
  fi
}

# ==== Print plan ====
print_plan() {
  log_step "Plan"
  log_info "  Repo:           $REPO_DIR"
  log_info "  Agent:          ${TARGET_AGENT:-custom}"
  log_info "  Profile:        ${PROFILE:-core}$([[ -n ${ONLY_SKILLS:-} ]] && echo ' (--only override)' || true)"
  log_info "  Skills dir:     $SKILLS_DIR"
  log_info "  Skills to setup: $*"
  log_info "  Skip deps:       $([[ ${SKIP_DEPS:-0} -eq 1 ]] && echo yes || echo no)"
  log_info "  Skip MCP setup:  $([[ ${SKIP_MCP_SETUP:-0} -eq 1 ]] && echo yes || echo no)"
  log_info "  Dry run:         $([[ ${DRY_RUN:-0} -eq 1 ]] && echo yes || echo no)"
  log_info "  Non-interactive: $([[ ${YES:-0} -eq 1 ]] && echo yes || echo no)"
}

# ==== Summary ====
print_summary() {
  local skills=("$@")
  selected_skill() {
    local expected="$1"
    local installed
    for installed in "${skills[@]}"; do
      [[ "$installed" == "$expected" ]] && return 0
    done
    return 1
  }

  printf '\n%s%s=== Setup complete ===%s\n\n' "$C_BOLD" "$C_OK" "$C_RST"
  printf '  %-30s %s\n' "Skill" "Path"
  printf '  %-30s %s\n' "-----" "----"
  for skill in "${skills[@]}"; do
    local path="$SKILLS_DIR/$skill"
    local status="MISSING"
    if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
      status="PLANNED"
    elif [[ -f "$path/SKILL.md" ]]; then
      status="OK"
    fi
    printf '  %-30s %s [%s]\n' "$skill" "$path" "$status"
  done
  printf '\nNext steps:\n'
  local next_step=1
  printf '  %d. Mở %s mới và kiểm tra %d skill đã chọn\n' "$next_step" "$TARGET_AGENT" "${#skills[@]}"
  next_step=$((next_step + 1))

  if selected_skill "support-document-conversion"; then
    printf '  %d. Test support-document-conversion:      %s/support-document-conversion/scripts/convert.sh <file.pdf>\n' "$next_step" "$SKILLS_DIR"
    next_step=$((next_step + 1))
  fi
  if selected_skill "dynamic-web-exploratory"; then
    printf '  %d. Test dynamic-web-exploratory:         cd <project>/qa && node %s/dynamic-web-exploratory/scripts/login.mjs\n' "$next_step" "$SKILLS_DIR"
    next_step=$((next_step + 1))
  fi
  if selected_skill "integration-postman"; then
    if [[ "$TARGET_AGENT" == "antigravity" ]]; then
      printf '  %d. Postman OAuth:       restart Antigravity, chạy /mcp và đăng nhập Postman\n' "$next_step"
    elif [[ "$TARGET_AGENT" == "codex" ]]; then
      printf '  %d. Postman OAuth:       codex mcp login postman\n' "$next_step"
    else
      printf '  %d. Postman MCP:         cấu hình bằng MCP manager của %s\n' "$next_step" "$TARGET_AGENT"
    fi
    next_step=$((next_step + 1))
  fi

  printf '  %d. Agent doctor:        bash %s/scripts/doctor-agent.sh --agent=%s\n' "$next_step" "$REPO_DIR" "$TARGET_AGENT"
  next_step=$((next_step + 1))

  if selected_skill "integration-github"; then
    if [[ "$TARGET_AGENT" == "codex" || "$TARGET_AGENT" == "antigravity" ]]; then
      printf '  %d. QA MCP stack:        bash %s/integration-github/scripts/doctor-stack.sh --agent=%s\n' "$next_step" "$SKILLS_DIR" "$TARGET_AGENT"
    else
      printf '  %d. MCP:                 cấu hình và kiểm tra bằng MCP manager của Claude\n' "$next_step"
    fi
  fi

  cat <<EOF

Cập nhật skill sau này: git pull trong repo, rồi chạy lại ./scripts/setup.sh
(chỉ skill nào có file thay đổi sẽ được backup + copy lại).
EOF
}
