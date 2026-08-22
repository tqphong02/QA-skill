#!/usr/bin/env bash
# adapter/browser-session/scripts/install-skill.sh
# Print installation guide for ego lite.
# Does NOT download, install, or open anything automatically.
# User must complete install steps manually.
#
# Usage: sh adapter/browser-session/scripts/install-skill.sh

set -euo pipefail

echo ""
echo "ego-browser — Install Guide"
echo "==========================="
echo ""

# ── Platform check ──────────────────────────────────────────────────────────
OS="$(uname)"
if [[ "$OS" != "Darwin" ]]; then
  echo "  Platform: ${OS} — ego-browser is macOS only"
  echo ""
  echo "  Fallback options for this platform:"
  echo "    • Playwright MCP"
  echo "    • Chrome DevTools MCP"
  echo "    • Bundled Playwright runtime"
  echo ""
  exit 0
fi

ARCH="$(uname -m)"
echo "  Platform: macOS ${ARCH}"
echo ""

# ── Check if already installed ───────────────────────────────────────────────
APP_SYS="/Applications/ego lite.app"
APP_USR="$HOME/Applications/ego lite.app"
CLI_EXISTS=false
APP_EXISTS=false

command -v ego-browser &>/dev/null && CLI_EXISTS=true
[[ -d "$APP_SYS" || -d "$APP_USR" ]] && APP_EXISTS=true

if $CLI_EXISTS && $APP_EXISTS; then
  echo "  ✅ ego-browser CLI found"
  echo "  ✅ ego lite app found"
  echo ""
  echo "  ego lite appears to be installed."
  echo "  Run detect to verify: node adapter/browser-session/scripts/detect.mjs"
  echo "  Run smoke test:       node adapter/browser-session/scripts/smoke-test.mjs --url https://example.com"
  echo ""
  exit 0
fi

# ── Installation steps ───────────────────────────────────────────────────────
echo "  ego lite is not fully installed. Follow the steps below."
echo ""
echo "  OPTION A — npx skills CLI (recommended):"
echo "  -----------------------------------------"
echo "  npx skills add citrolabs/ego-lite"
echo ""
echo "  This installs the ego-browser skill. The first time your agent"
echo "  runs a browser task, it will prompt you to install the ego lite app."
echo ""
echo "  OPTION B — Download manually:"
echo "  ------------------------------"
echo "  1. Open https://lite.ego.app/ in your browser"
echo "  2. Download the macOS app for ${ARCH}"
echo "  3. Open the DMG and drag 'ego lite' to Applications"
echo "  4. Remove quarantine (run in Terminal):"
echo '     xattr -d com.apple.quarantine "/Applications/ego lite.app"'
echo "  5. Open ego lite from Applications"
echo ""
echo "  FIRST-RUN ONBOARDING:"
echo "  ----------------------"
echo "  On first launch, ego lite will ask whether to import your Chrome data."
echo "  Choose YES to inherit your existing logins, cookies, and extensions."
echo ""
echo "  ⚠️  After importing Chrome data, your AI agent can interact with your"
echo "     real logged-in sessions. Read the hard gates in adapter/browser-session/SKILL.md"
echo "     before running any task on production environments."
echo ""
echo "  AFTER INSTALLING:"
echo "  -----------------"
echo "  node adapter/browser-session/scripts/detect.mjs"
echo "  node adapter/browser-session/scripts/smoke-test.mjs --url https://example.com"
echo ""
echo "  More info: https://github.com/citrolabs/ego-lite"
echo ""
