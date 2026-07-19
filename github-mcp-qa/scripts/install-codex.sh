#!/usr/bin/env bash

set -euo pipefail

SERVER_NAME="github"
SERVER_URL="https://api.githubcopilot.com/mcp/x/all"
LOGIN=0
REPLACE=0
DRY_RUN=0

usage() {
  printf '%s\n' \
    "Cài GitHub MCP chính chủ cho Codex" \
    "" \
    "Usage: $0 [--login] [--replace] [--dry-run]" \
    "" \
    "  --login    Mở luồng OAuth sau khi cấu hình" \
    "  --replace  Thay cấu hình server github hiện có nếu URL khác" \
    "  --dry-run  Chỉ hiển thị hành động, không thay đổi cấu hình" \
    "  --help     Hiển thị trợ giúp"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --login) LOGIN=1 ;;
    --replace) REPLACE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Tham số không hợp lệ: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if ! command -v codex >/dev/null 2>&1; then
  printf '%s\n' "Không tìm thấy lệnh codex trong PATH" >&2
  exit 1
fi

existing=""
if existing=$(codex mcp get "$SERVER_NAME" 2>/dev/null); then
  if grep -Fq "url: $SERVER_URL" <<<"$existing"; then
    printf '%s\n' "GitHub MCP đã dùng đúng endpoint all toolsets"
  elif [[ "$REPLACE" -eq 1 ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      printf '[DRY-RUN] codex mcp remove %s\n' "$SERVER_NAME"
      printf '[DRY-RUN] codex mcp add %s --url %s\n' "$SERVER_NAME" "$SERVER_URL"
    else
      codex mcp remove "$SERVER_NAME"
      codex mcp add "$SERVER_NAME" --url "$SERVER_URL"
    fi
  else
    printf '%s\n' \
      "Server github đã tồn tại nhưng không dùng endpoint mong muốn" \
      "Chạy lại với --replace sau khi kiểm tra cấu hình hiện tại:" >&2
    printf '%s\n' "$existing" >&2
    exit 2
  fi
else
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[DRY-RUN] codex mcp add %s --url %s\n' "$SERVER_NAME" "$SERVER_URL"
  else
    codex mcp add "$SERVER_NAME" --url "$SERVER_URL"
  fi
fi

if [[ "$LOGIN" -eq 1 ]]; then
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[DRY-RUN] codex mcp login %s\n' "$SERVER_NAME"
  else
    codex mcp login "$SERVER_NAME"
  fi
else
  printf '%s\n' \
    "Đã cấu hình server nhưng chưa đăng nhập" \
    "Khi sẵn sàng, chạy: codex mcp login github"
fi

if [[ "$DRY_RUN" -eq 0 ]]; then
  codex mcp get "$SERVER_NAME"
  printf '%s\n' "Khởi động lại Codex hoặc mở thread mới để nạp tools"
fi
