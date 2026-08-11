#!/usr/bin/env bash

set -euo pipefail

EXPECTED_URL="https://api.githubcopilot.com/mcp/"

if ! command -v codex >/dev/null 2>&1; then
  printf '%s\n' "FAILED runtime_missing codex" >&2
  exit 1
fi

if ! config=$(codex mcp get github 2>/dev/null); then
  printf '%s\n' \
    "FAILED mcp_not_configured github" \
    "Chạy: ./integration/github/scripts/install-codex.sh" >&2
  exit 1
fi

printf '%s\n' "$config"

if ! grep -Fq "url: $EXPECTED_URL" <<<"$config" && ! grep -Fq "url: ${EXPECTED_URL}x/all" <<<"$config"; then
  printf '%s\n' \
    "FAILED wrong_endpoint github" \
    "Expected: $EXPECTED_URL hoặc ${EXPECTED_URL}x/all" >&2
  exit 1
fi

printf '%s\n' \
  "PASS GitHub MCP đã cấu hình cho Codex" \
  "MANUAL kiểm tra Auth bằng codex mcp list rồi smoke test read-only trong phiên mới"
