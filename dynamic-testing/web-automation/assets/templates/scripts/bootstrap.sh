#!/usr/bin/env bash
# bootstrap.sh — One-shot setup cho project mới copy từ template.
#
# Idempotent: chạy 2 lần không lỗi.
#
# Công việc:
#   1. Tự cài dependency Playwright/TypeScript và Chromium trong project-local.
#   2. Kiểm tra TypeScript trước khi chạy test.
#   3. Copy .env.example → .env nếu chưa có (giữ nguyên nếu đã có).
#   4. In hướng dẫn fill 4 biến REQUIRED + gợi ý chạy test mẫu.
#
# Cách dùng:
#   npm run bootstrap
#   bash scripts/bootstrap.sh

set -euo pipefail

# Màu output cho dễ đọc
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; }

# ─────────────────────────────────────────────────────────────
# Step 1 — Bootstrap project-local Playwright runtime
# ─────────────────────────────────────────────────────────────
node scripts/bootstrap-playwright.mjs --project-root . --browsers chromium
ok "Project-local Playwright runtime đã sẵn sàng."

# ─────────────────────────────────────────────────────────────
# Step 2 — Copy .env.example → .env nếu chưa có
# ─────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    ok "Đã tạo .env từ .env.example."
  else
    fail ".env.example không tồn tại — template có gì đó sai."
    exit 1
  fi
else
  ok ".env đã có sẵn — không touch."
fi

# ─────────────────────────────────────────────────────────────
# Step 3 — In hướng dẫn
# ─────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══ Bootstrap xong ═══${NC}"
echo ""
echo "Bước tiếp theo:"
echo ""
echo "  1. Sửa .env — điền 4 giá trị REQUIRED:"
echo "       API_BASE_URL, UI_BASE_URL, TEST_USER, TEST_PASS"
echo ""
echo "  2. Validate không còn placeholder:"
echo "       npm run placeholder-check"
echo ""
echo "  3. Chạy test mẫu:"
echo "       npm run test:ui"
echo ""
echo "  4. Xem report:"
echo "       npm run test:report"
echo "       # hoặc  npm run allure:gen && npm run allure:open"
echo ""
ok "Sẵn sàng chạy."
