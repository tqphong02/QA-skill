#!/usr/bin/env bash

set -euo pipefail

EXPECTED_URL="https://api.githubcopilot.com/mcp/x/all"

if ! command -v codex >/dev/null 2>&1; then
  printf '%s\n' "FAILED: không tìm thấy codex trong PATH" >&2
  exit 1
fi

if ! config=$(codex mcp get github 2>/dev/null); then
  printf '%s\n' \
    "FAILED: chưa có GitHub MCP" \
    "Chạy: ./github-mcp-qa/scripts/install-codex.sh --login" >&2
  exit 1
fi

printf '%s\n' "$config"

if ! grep -Fq "url: $EXPECTED_URL" <<<"$config"; then
  printf '%s\n' \
    "FAILED: GitHub MCP chưa dùng endpoint all toolsets" \
    "Chạy: ./github-mcp-qa/scripts/install-codex.sh --replace --login" >&2
  exit 1
fi

printf '%s\n' \
  "PASS: GitHub MCP đã cấu hình all toolsets" \
  "Kiểm tra cột Auth bằng: codex mcp list" \
  "Nếu vừa login, hãy khởi động lại Codex hoặc mở thread mới"
