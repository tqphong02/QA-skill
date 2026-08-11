#!/usr/bin/env bash
# bootstrap.sh — One-shot setup cho project mới copy từ template.
#
# Idempotent: chạy 2 lần không lỗi.
#
# Công việc:
#   1. Verify đã `npm install` (không thì exit với hint).
#   2. Verify Playwright browsers đã cài (chạy playwright install nếu thiếu).
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
# Step 1 — Verify node_modules
# ─────────────────────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  fail "node_modules/ chưa tồn tại."
  echo ""
  echo "  Chạy trước:"
  echo "    npm install"
  echo ""
  echo "  (postinstall hook sẽ tự cài Playwright browsers sau npm install)"
  exit 1
fi
ok "node_modules/ đã có."

# ─────────────────────────────────────────────────────────────
# Step 2 — Verify Playwright browsers (best-effort, skip nếu lỗi vì thiếu sudo)
# ─────────────────────────────────────────────────────────────
if command -v npx >/dev/null 2>&1 && [ -f "node_modules/.bin/playwright" ]; then
  if ! npx playwright --version >/dev/null 2>&1; then
    warn "Playwright chưa khả dụng — bỏ qua step này."
  else
    ok "Playwright CLI sẵn sàng."
    # Không ép install browsers ở đây — postinstall hook đã lo. Chỉ check nhẹ.
    if npx playwright install --dry-run chromium 2>/dev/null | grep -q "is already installed"; then
      ok "Chromium browser đã cài."
    else
      warn "Chromium chưa cài. Chạy:  npm run install:browsers"
    fi
  fi
fi

# ─────────────────────────────────────────────────────────────
# Step 3 — Copy .env.example → .env nếu chưa có
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
# Step 4 — In hướng dẫn
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
