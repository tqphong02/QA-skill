#!/usr/bin/env bash

set -euo pipefail

SERVER_NAME="github"
SERVER_URL="https://api.githubcopilot.com/mcp/"
LOGIN=0
REPLACE=0
DRY_RUN=0
TOKEN_ENV="GITHUB_PAT_TOKEN"

usage() {
  printf '%s\n' \
    "Cài GitHub MCP chính chủ cho Codex" \
    "" \
    "Usage: $0 [--token-env NAME] [--login] [--replace] [--dry-run]" \
    "" \
    "  --token-env  Tên environment variable chứa PAT, mặc định GITHUB_PAT_TOKEN" \
    "  --login      Thử OAuth thay PAT; chỉ dùng khi Codex host hỗ trợ OAuth app của GitHub" \
    "  --replace  Thay cấu hình server github hiện có nếu URL khác" \
    "  --dry-run  Chỉ hiển thị hành động, không thay đổi cấu hình" \
    "  --help     Hiển thị trợ giúp"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --login) LOGIN=1 ;;
    --token-env=*) TOKEN_ENV="${1#*=}" ;;
    --token-env) shift; TOKEN_ENV="${1:-}" ;;
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

if [[ "$LOGIN" -eq 0 ]] && [[ "$DRY_RUN" -eq 0 ]] && [[ -z "${!TOKEN_ENV:-}" ]]; then
  printf '%s\n' \
    "Không tìm thấy PAT trong environment variable $TOKEN_ENV" \
    "Export token trong terminal hiện tại hoặc dùng --login nếu Codex host hỗ trợ OAuth GitHub" >&2
  exit 1
fi

existing=""
if existing=$(codex mcp get "$SERVER_NAME" 2>/dev/null); then
  if grep -Fq "url: $SERVER_URL" <<<"$existing"; then
    printf '%s\n' "GitHub MCP đã dùng đúng endpoint all toolsets"
  elif [[ "$REPLACE" -eq 1 ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      printf '[DRY-RUN] codex mcp remove %s\n' "$SERVER_NAME"
      printf '[DRY-RUN] codex mcp add %s --url %s --bearer-token-env-var %s\n' "$SERVER_NAME" "$SERVER_URL" "$TOKEN_ENV"
    else
      codex mcp remove "$SERVER_NAME"
      if [[ "$LOGIN" -eq 1 ]]; then
        codex mcp add "$SERVER_NAME" --url "$SERVER_URL"
      else
        codex mcp add "$SERVER_NAME" --url "$SERVER_URL" --bearer-token-env-var "$TOKEN_ENV"
      fi
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
    printf '[DRY-RUN] codex mcp add %s --url %s --bearer-token-env-var %s\n' "$SERVER_NAME" "$SERVER_URL" "$TOKEN_ENV"
  else
    if [[ "$LOGIN" -eq 1 ]]; then
      codex mcp add "$SERVER_NAME" --url "$SERVER_URL"
    else
      codex mcp add "$SERVER_NAME" --url "$SERVER_URL" --bearer-token-env-var "$TOKEN_ENV"
    fi
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
    "Đã cấu hình server dùng PAT từ environment variable $TOKEN_ENV" \
    "Không đóng terminal đã export token trước khi mở Codex"
fi

if [[ "$DRY_RUN" -eq 0 ]]; then
  codex mcp get "$SERVER_NAME"
  printf '%s\n' "Khởi động lại Codex hoặc mở thread mới để nạp tools"
fi
