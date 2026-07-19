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

Setup toàn bộ 16 QA, Security Engineering và MCP integration skill. Dùng --agent để chọn đúng AI host; --skills-dir chỉ dùng khi cần override có chủ đích.

Options:
  --skip-deps           Chỉ copy skills + setup AI config; bỏ qua npm install / pip install
  --dry-run             In mọi command sẽ chạy, KHÔNG mutate filesystem
  --only=<skill[,..]>   Chỉ setup 1 hoặc nhiều skill (vd: --only=qa-run,doc-to-md)
  --agent=<name>        codex, antigravity hoặc claude; auto chỉ chạy khi detect đúng một host
  --skills-dir=<path>   Override thư mục discovery do --agent chọn
  --yes / -y            Non-interactive (default = backup khi xung đột)
  --no-color            Tắt màu output
  --help / -h           In trợ giúp này

Environment variables:
  QA_SKILL_AGENT        Giá trị mặc định cho --agent
  SKILLS_DIR            Override thư mục discovery
  SKIP_DEPS=1           Tương đương --skip-deps
  NO_COLOR=1            Tắt màu

Examples:
  ./scripts/setup.sh --agent=codex --yes
  ./scripts/setup.sh --agent=antigravity --yes
  ./scripts/setup.sh --agent=claude --yes
  ./scripts/setup.sh --agent=codex --skip-deps --yes
  ./scripts/setup.sh --agent=antigravity --dry-run
  ./scripts/setup.sh --agent=claude --only=doc-to-md --yes
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
      if command -v agy >/dev/null 2>&1 || [[ -d "/Applications/Antigravity.app" ]]; then
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
      printf '%s\n' "${CODEX_HOME:-$HOME/.codex}/skills"
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
  local candidates=("python3.12" "python3.11" "python3.10" "python3" "/usr/bin/python3" "/usr/local/bin/python3")
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
    log_warn "Python 3 NOT found. doc-to-md + testcase-template + business-analysis sẽ KHÔNG chạy được."
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
    log_warn "Python $v found (< 3.10). doc-to-md cần >= 3.10."
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
    log_warn "Node.js NOT found. qa-run + business-analysis sẽ KHÔNG chạy được."
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
    log_warn "Node $v found (< 20). qa-run + business-analysis cần >= 20."
    log_warn "  'brew install node@20' hoặc 'nvm install 20'"
    return 1
  fi
  log_ok "Node $v"
  return 0
}

# ==== Skills resolution ====
DEFAULT_SKILLS=("qa-run" "testcase-template" "playwright-pom-automation" "doc-to-md" "business-analysis" "pentest-run" "plane-qa" "google-drive-qa" "data-quality-qa" "ai-quality-qa" "accessibility-qa" "performance-qa" "api-contract-qa" "mobile-qa" "jmeter-qa" "github-mcp-qa")

resolve_skill_list() {
  local only="$1"
  if [[ -z "$only" ]]; then
    printf '%s\n' "${DEFAULT_SKILLS[@]}"
    return 0
  fi
  local IFS=','
  local req=($only)
  local valid=()
  for s in "${req[@]}"; do
    if [[ -d "$REPO_DIR/$s" ]]; then
      valid+=("$s")
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

# ==== Copy skill (with excludes) ====
copy_skill() {
  local src="$REPO_DIR/$1"
  local dst="$SKILLS_DIR/$1"

  if [[ ! -d "$src" ]]; then
    log_err "Source không tồn tại: $src"
    return 1
  fi

  if [[ -e "$dst" ]]; then
    resolve_skill_conflict "$dst" || return 1
  fi

  if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
    log_dry "cp -R (with excludes) $src $dst"
    return 0
  fi

  mkdir -p "$dst"
  # Detect Windows-style src to make sure $dst exists as a dir already
  # rsync if available (macOS có sẵn, Linux thường có), fallback cp
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude='node_modules' --exclude='evidence' --exclude='.env' \
      --exclude='auth.json' --exclude='.DS_Store' --exclude='__pycache__' \
      --exclude='*.pyc' --exclude='dist' --exclude='build' \
      --exclude='*.bak' --exclude='*.tmp' \
      "$src/" "$dst/"
  else
    # Fallback: copy then cleanup (works on Git Bash MINGW/MSYS too,
    # since 'cp -R src/.' is non-POSIX; we use 'cp -R src dst').
    cp -R "$src"/* "$dst"/ 2>/dev/null || cp -R "$src" "$dst"
    # Cleanup excludes (best-effort)
    for exclude in node_modules evidence '.env' auth.json '.DS_Store' __pycache__; do
      rm -rf "$dst/$exclude" 2>/dev/null || true
    done
    find "$dst" -name '*.pyc' -delete 2>/dev/null || true
  fi
  log_ok "$1 → $dst"
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
      local bak="${dst}.bak.$ts"
      if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
        log_dry "mv $dst $bak"
      else
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
      else
        log_step "npm install trong $skill"
        (cd "$skill_path" && npm install --no-audit --no-fund --loglevel=error) \
          && log_ok "$skill: npm install OK" \
          || log_warn "$skill: npm install fail (kiểm tra network)"
      fi
    else
      log_info "$skill: không có package.json — skip npm"
    fi
  done
}

# ==== Install Python deps ====
install_python_deps() {
  local py_bin=""
  for py in python3.11 python3.12 python3.10 python3 "/usr/bin/python3"; do
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
  if [[ -n "${ANTIGRAVITY_API_KEY:-}" ]] || [[ -d "/Applications/Antigravity.app" ]]; then
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
      if [[ -d "/Applications/Antigravity.app" ]]; then
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

# ==== Verify ====
verify_installation() {
  log_step "Verify"
  # 1. AI provider status (works as long as python3 anywhere)
  local py_bin=""
  for py in python3.11 python3.12 python3.10 python3; do
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
  if [[ -n "$py_bin" ]]; then
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
    local qa_run_tdata="$SKILLS_DIR/qa-run/lib/tdata.mjs"
    if [[ -f "$qa_run_tdata" ]]; then
      if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
        log_dry "node -e 'import(\"$qa_run_tdata\")...' (tdata)"
      else
        if node -e "import('$qa_run_tdata').then(m => console.log('  qa-run tdata: ' + m.tdata('setup','smoke')))" 2>/dev/null; then
          log_ok "Node deps (qa-run/lib/tdata.mjs)"
        else
          log_warn "qa-run tdata load fail — kiểm tra cd qa-run && npm install"
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
  log_info "  Skills dir:     $SKILLS_DIR"
  log_info "  Skills to setup: $*"
  log_info "  Skip deps:       $([[ ${SKIP_DEPS:-0} -eq 1 ]] && echo yes || echo no)"
  log_info "  Dry run:         $([[ ${DRY_RUN:-0} -eq 1 ]] && echo yes || echo no)"
  log_info "  Non-interactive: $([[ ${YES:-0} -eq 1 ]] && echo yes || echo no)"
}

# ==== Summary ====
print_summary() {
  local skills=("$@")
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
  cat <<EOF

Next steps:
  1. Mở $TARGET_AGENT mới và kiểm tra ${#skills[@]} skill đã chọn
  2. Test doc-to-md:      $SKILLS_DIR/doc-to-md/scripts/convert.sh <file.pdf>
  3. Test qa-run:         cd <project>/qa && node $SKILLS_DIR/qa-run/scripts/login.mjs
  4. Agent doctor:        bash $REPO_DIR/scripts/doctor-agent.sh --agent=$TARGET_AGENT
EOF

  if [[ "$TARGET_AGENT" == "codex" || "$TARGET_AGENT" == "antigravity" ]]; then
    printf '  5. QA MCP stack:        bash %s/github-mcp-qa/scripts/doctor-stack.sh --agent=%s\n' "$SKILLS_DIR" "$TARGET_AGENT"
  else
    printf '%s\n' '  5. MCP:                 cấu hình và kiểm tra bằng MCP manager của Claude'
  fi

  cat <<EOF

Cập nhật skill sau này: git pull trong repo, rồi chạy lại ./scripts/setup.sh
(chỉ skill nào có file thay đổi sẽ được backup + copy lại).
EOF
}
