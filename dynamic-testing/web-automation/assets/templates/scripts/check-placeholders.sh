#!/usr/bin/env bash
# check-placeholders.sh — Grep tất cả file đã generate xem còn <...> placeholder chưa fill.
#
# Tại sao cần: AI generate code từ metaskill template rất dễ quên fill placeholder.
# Commit nhầm → tsc compile fail im lặng hoặc chạy test với giá trị "<RESOURCE>" gây bug khó trace.
#
# Cách dùng:
#   bash scripts/check-placeholders.sh
#   bash scripts/check-placeholders.sh tests/api/users.api.spec.ts    # check 1 file
#
# CI integration (GitHub Actions):
#   - name: Check placeholders filled
#     run: bash scripts/check-placeholders.sh
#
# Convention: Tất cả placeholder trong templates dùng format:
#   - <UPPERCASE_SNAKE>      — chính (vd: <RESOURCE>, <API_BASE_URL>)
#   - <kebab-case>           — cho package.json project name, k6 scenarios (vd: <project-name>)
#   - <lowercase-words>      — cho description trong markdown (vd: <mô tả intent>)
#   - <email@domain>         — cho placeholder email (vd: <admin@test.com>)
# Regex bắt TẤT CẢ <X> trừ TS generics (<T>, <K extends keyof T>, <string, unknown>)

set -euo pipefail

# ─────────────────────────────────────────────────────────────
# CONFIG — AI/customize theo project
# ─────────────────────────────────────────────────────────────
# Scan dirs + root files. Mặc định scan project root + các folder thường gặp.
SCAN_DIRS="${SCAN_DIRS:-.}"
# Extensions to scan
SCAN_EXTENSIONS="${SCAN_EXTENSIONS:-ts js json yml yaml md}"
# Files scan không theo extension (vd: Jenkinsfile, .env.example)
SCAN_FILES="${SCAN_FILES:-Jenkinsfile .env.example}"
# ⚠️ MAINTAINER NOTE về cấu trúc EXCLUDE_PATTERN:
#
# Patterns bên dưới được split trên `|` (xem line 81) trước khi áp dụng từng
# pattern cho `grep -qE`. Vì vậy:
#   - KHÔNG được viết nested alternation như `(a|b|c)` bên trong 1 segment —
#     splitter sẽ cắt các `|` bên trong, làm vỡ pattern.
#   - Phải liệt kê TỪNG alternative thành 1 segment riêng, nối bằng `|`.
#
# Ví dụ: thay vì gọn `(/\.env$|^\.env$|^\.env\..+$)` (sẽ bị split thành 4 mảnh
# rời rạc `\.env$`, `^\.env$`, `^\.env\..+$`, và 2 mảnh rỗng), phải viết tách:
#   /\.env$ / \.env\..+$ / ^\.env$ / ^\.env\..+$   (4 segment, mỗi cái độc lập).
#
# Nếu sau này muốn "dọn gọn" lại thành 1 group — ĐỪNG. Test bằng cách chạy:
#   bash scripts/check-placeholders.sh
# trên template trước khi commit.
#
# Note: patterns are split on `|` (line 81), so do NOT use unescaped `|` inside
# a pattern. Use one alternative per pipe-segment. `.env*` variants each get
# their own segment so nested alternation doesn't break the split.
# Use [/\\.] to match path separator (works for both `find` output `./.env` and
# absolute paths like `/repo/.env`). Then test for basename `.env` or `.env.*`.
EXCLUDE_PATTERN="${EXCLUDE_PATTERN:-TEMPLATE\.md|node_modules|sessions/.*\.json|testdata/.*\.json|reports|playwright-report|test-results|allure-results|\.git|README\.md|PLACEHOLDERS\.md|/\.env$|/\.env\..+$|^\.env$|^\.env\..+$}"

# ANSI colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Check Placeholders — dynamic-web-automation metaskill${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Scan dirs:        ${YELLOW}${SCAN_DIRS}${NC}"
echo -e "Extensions:       ${YELLOW}${SCAN_EXTENSIONS}${NC}"
echo -e "Specific files:   ${YELLOW}${SCAN_FILES}${NC}"
echo -e "Exclude pattern:  ${YELLOW}${EXCLUDE_PATTERN}${NC}"
echo -e "Convention:       ${YELLOW}<UPPERCASE_SNAKE> | <kebab-case> | <email> | <lowercase>${NC}"
echo ""

# ─────────────────────────────────────────────────────────────
# Find files to scan
# ─────────────────────────────────────────────────────────────
FILES_TO_CHECK=()
if [ $# -gt 0 ]; then
  for f in "$@"; do
    if [ -f "$f" ]; then
      FILES_TO_CHECK+=("$f")
    else
      echo -e "${RED}✗ File not found: $f${NC}"
      exit 1
    fi
  done
else
  # Build find expression for multiple extensions
  FIND_EXPR=""
  for ext in $SCAN_EXTENSIONS; do
    FIND_EXPR="${FIND_EXPR} -name '*.${ext}' -o"
  done
  # Remove trailing -o
  FIND_EXPR="${FIND_EXPR%-o}"

  # Scan by extension
  for dir in $SCAN_DIRS; do
    if [ -d "$dir" ]; then
      while IFS= read -r -d '' file; do
        # Exclude pattern check (extended regex)
        excluded=false
        for pat in $(echo "$EXCLUDE_PATTERN" | tr '|' ' '); do
          if echo "$file" | grep -qE "$pat"; then
            excluded=true
            break
          fi
        done
        if [ "$excluded" = false ]; then
          FILES_TO_CHECK+=("$file")
        fi
      done < <(eval "find '$dir' -type f \\( $FIND_EXPR \\) -print0" 2>/dev/null)
    fi
  done

  # Scan specific files in root (Jenkinsfile, .env.example)
  for file in $SCAN_FILES; do
    if [ -f "$file" ]; then
      excluded=false
      for pat in $(echo "$EXCLUDE_PATTERN" | tr '|' ' '); do
        if echo "$file" | grep -qE "$pat"; then
          excluded=true
          break
        fi
      done
      if [ "$excluded" = false ]; then
        FILES_TO_CHECK+=("$file")
      fi
    fi
  done
fi

if [ ${#FILES_TO_CHECK[@]} -eq 0 ]; then
  echo -e "${YELLOW}⚠ No files to check. Run from project root.${NC}"
  exit 0
fi

echo "Scanning ${#FILES_TO_CHECK[@]} files..."
echo ""

# ─────────────────────────────────────────────────────────────
# Check each file — filter TS generics & comment-only lines
# ─────────────────────────────────────────────────────────────
TOTAL_PLACEHOLDERS=0
FILES_WITH_PLACEHOLDERS=0
CROSS_CHECK_FAILED=0
declare -a ISSUES=()

# Pattern: bắt mọi <X> (uppercase, lowercase, kebab-case, email, mixed)
# Trừ TS generics
GENERIC_RE='<([A-Za-z_][A-Za-z0-9_]*[[:space:]]*(extends|=|,|\|)[^>]*|<[A-Za-z_][A-Za-z0-9_]*[[:space:]]+[A-Za-z_][A-Za-z0-9_]*>)'

for file in "${FILES_TO_CHECK[@]}"; do
  # Grep placeholder theo convention chính: <UPPERCASE_SNAKE> (≥ 2 chars)
  # Cũng bắt <lowercase-words>, <kebab-case>, <email@domain> qua bước 2
  MATCHES=$(grep -nE '<[A-Z][A-Z0-9_]+>' "$file" 2>/dev/null || true)

  # Bước 2: Bắt các format khác (lowercase, kebab, email) — nhưng filter kỹ
  EXTRA_MATCHES=$(grep -nE '<[a-z][a-z0-9._@-]*>' "$file" 2>/dev/null || true)
  if [ -n "$EXTRA_MATCHES" ]; then
    MATCHES="${MATCHES}"$'\n'"${EXTRA_MATCHES}"
  fi

  if [ -n "$MATCHES" ]; then
    REAL_MATCHES=""
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      ext="${file##*.}"
      stripped=$(echo "$line" | sed -E 's/^[0-9]+://')

      # ─── Filter: comment lines ───────────────────────────
      case "$ext" in
        ts|js|tsx|jsx)
          if echo "$stripped" | grep -qE '^[[:space:]]*(//|/\*|\*[^/]|[[:space:]]+\*[^/])'; then
            continue
          fi
          # Inline trailing comment: cắt tại //
          if echo "$stripped" | grep -qE '//'; then
            stripped=$(echo "$stripped" | sed -E 's|//.*||')
            line="${line%%//*}<COMMENT>"
          fi
          ;;
        yml|yaml|env)
          if echo "$stripped" | grep -qE '^[[:space:]]*#'; then
            continue
          fi
          ;;
        md)
          if echo "$stripped" | grep -qE '^[[:space:]]*<!--'; then
            continue
          fi
          ;;
      esac

      # ─── Filter: TS generics ─────────────────────────────
      # ⚠️ CẢNH BÁO CHO MAINTAINER:
      # Filter dưới đây dựa trên WHITELIST các tên generic TS thông dụng.
      # Đây là cách dễ vỡ: nếu code dùng generic mới (VD: <DAO>, <VO>, <ENTITY>, <PK>, <AGGREGATE>)
      # KHÔNG có trong whitelist, script sẽ false-positive báo đó là placeholder.
      #
      # Cách bền hơn (chưa implement): dựa vào NGỮ CẢNH CÚ PHÁP:
      #   - Generic TS: luôn đứng sát identifier KHÔNG có space (Promise<X>, Array<X>, Repository<ID>)
      #   - Placeholder thật: thường đứng độc lập (giữa =, ", hoặc xuất hiện ở vị trí string literal)
      #
      # Nếu gặp generic lạ KHÔNG filter được → thêm vào whitelist bên dưới,
      # HOẶC tốt hơn: wrap placeholder generic đó trong comment để skip.
      #
      # Test: nếu script "âm thầm pass" 1 placeholder trùng tên generic thông dụng
      # (VD: <ID> làm tên biến placeholder) → đây là bug whitelist, cần refactor sang context-based.

      # Cú pháp generic có space bên trong: <X extends Y>, <X | Y>, <X = Y>, <X, Y>
      if echo "$stripped" | grep -qE '<[A-Za-z_][A-Za-z0-9_]*[[:space:]]'; then
        continue
      fi
      # <typeof X>
      if echo "$stripped" | grep -qE '<typeof'; then
        continue
      fi
      # Single-letter generic <T> — uppercase
      if echo "$stripped" | grep -qE '<[A-Z]>'; then
        continue
      fi
      # ⚠️ WHITELIST TS PRIMITIVE GENERICS — cần update khi có generic mới
      # Lowercase TS primitives: <void>, <string>, <number>, <boolean>, <never>, <unknown>,...
      # Uppercase utility types: <Promise>, <Array>, <Readonly>, <Partial>, <Pick>,...
      # Lowercase generic type names thường gặp: <entity>, <dao>, <vo>, <pk>
      if echo "$stripped" | grep -qE '<(void|string|number|boolean|never|unknown|null|undefined|any|object|symbol|bigint|entity|dao|vo|pk|aggregate|root|aggregateRoot)>'; then
        continue
      fi
      # Uppercase TS utility types & common type names: <T>, <ID>, <DTO>, <REQ>, <RES>,...
      # DDD/repository pattern: <DAO>, <VO>, <PK>, <AGGREGATE>, <AGGREGATEROOT>...
      # ⚠️ Khi thêm generic mới: cập nhật CẢ 2 list (lowercase line 210 + uppercase line 214).
      # Whitelist cứng này sẽ vỡ với generic mới (REPO, SPEC, VIEWMODEL,...) — đó là
      # giới hạn đã được cảnh báo từ đầu (xem comment block ở dòng ~174). Khi gặp case
      # mới: thêm tên vào list tương ứng bên dưới HOẶC wrap placeholder đó trong comment.
      if echo "$stripped" | grep -qE '<(Array|Set|Map|Promise|Record|Partial|Required|Readonly|Pick|Omit|Exclude|Extract|Parameters|ReturnType|ID|DTO|REQ|RES|VALUE|KEY|ENTITY|TYPE|DAO|VO|PK|AGGREGATE|AGGREGATEROOT)>'; then
        continue
      fi
      # Function call generic: foo<T>()  — generic ngay trước (
      if echo "$stripped" | grep -qE '<[A-Z][A-Z0-9_]*>\('; then
        continue
      fi
      # Function return type: (): Promise<void>  — generic trước > ngay sau )
      if echo "$stripped" | grep -qE '\)[[:space:]]*:[[:space:]]*[A-Z][A-Za-z0-9_]*<[A-Z][A-Z0-9_]*>'; then
        continue
      fi
      # Function return type: (): Promise<lowercase>  — Promise<void>,...
      if echo "$stripped" | grep -qE '\)[[:space:]]*:[[:space:]]*[A-Z][A-Za-z0-9_]*<[a-z]+>'; then
        continue
      fi
      # Type annotation generic: const x: Foo<BAR> = — generic sau :
      if echo "$stripped" | grep -qE ':[[:space:]]*[A-Z][A-Za-z0-9_]*<[A-Z][A-Z0-9_]*>'; then
        continue
      fi
      # Empty <>
      if echo "$stripped" | grep -qE '<>'; then
        continue
      fi

      REAL_MATCHES="${REAL_MATCHES}${line}"$'\n'
    done <<< "$MATCHES"

    if [ -n "$REAL_MATCHES" ]; then
      FILES_WITH_PLACEHOLDERS=$((FILES_WITH_PLACEHOLDERS + 1))
      COUNT=$(echo "$REAL_MATCHES" | grep -c .)
      TOTAL_PLACEHOLDERS=$((TOTAL_PLACEHOLDERS + COUNT))
      ISSUES+=("FILE: $file")
      while IFS= read -r line; do
        [ -n "$line" ] && ISSUES+=("  $line")
      done <<< "$REAL_MATCHES"
      ISSUES+=("")
    fi
  fi
done

# ─────────────────────────────────────────────────────────────
# Report
# ─────────────────────────────────────────────────────────────
if [ $TOTAL_PLACEHOLDERS -eq 0 ]; then
  echo -e "${GREEN}✓ All files filled — no <placeholder> found.${NC}"
  echo ""
fi

if [ $TOTAL_PLACEHOLDERS -gt 0 ]; then
  echo -e "${RED}✗ Found $TOTAL_PLACEHOLDERS placeholder(s) in $FILES_WITH_PLACEHOLDERS file(s):${NC}"
  echo ""
  for issue in "${ISSUES[@]}"; do
    echo -e "  $issue"
  done

  echo ""
  echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${YELLOW}  How to fix${NC}"
  echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "1. Open each file above"
  echo "2. Find placeholder (vd: <RESOURCE>, <admin@test.com>, <project-name>)"
  echo "3. Replace with project-specific value"
  echo ""
  echo "Common placeholder formats:"
  echo "  <UPPERCASE_SNAKE>     → <RESOURCE>, <API_BASE_URL>, <ADMIN_TEST_COM>"
  echo "  <lowercase-words>      → <project-name>, <mô tả intent>, <domain>"
  echo "  <email@domain>         → <admin@test.com>"
  echo ""
  echo "If you intentionally want to keep some placeholders (vd: example values),"
  echo "wrap them in comments:  // <placeholder kept as example>"
  echo ""
fi

# ─────────────────────────────────────────────────────────────
# Cross-check: PLACEHOLDERS.md ↔ code
# ─────────────────────────────────────────────────────────────
if [ -f "PLACEHOLDERS.md" ]; then
  echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${YELLOW}  Cross-check: PLACEHOLDERS.md ↔ code${NC}"
  echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
  echo ""

  # Extract placeholder names từ PLACEHOLDERS.md (column 1 trong table rows)
  # Format table: | `<RESOURCE>` | ... |
  # Skip narrative lines (chỉ lấy rows bắt đầu bằng |)
  DECLARED_PLACEHOLDERS=$(grep -E '^\|' PLACEHOLDERS.md \
    | grep -oE '`<[A-Z][A-Z0-9_]+>`' \
    | sort -u \
    | sed 's|`||g')

  # Extract placeholder names từ code (excluding comments)
  FOUND_PLACEHOLDERS=""
  for file in "${FILES_TO_CHECK[@]}"; do
    if [ -f "$file" ]; then
      file_matches=$(grep -nE '<[A-Z][A-Z0-9_]+>' "$file" 2>/dev/null \
        | grep -vE '^\s*[0-9]+:\s*(//|/\*|\*[^/]|#|<!--)' \
        | grep -oE '<[A-Z][A-Z0-9_]+>' || true)
      FOUND_PLACEHOLDERS="${FOUND_PLACEHOLDERS}${file_matches}"$'\n'
    fi
  done
  FOUND_PLACEHOLDERS=$(echo "$FOUND_PLACEHOLDERS" | grep -v '^$' | sort -u)

  # Placeholders in code nhưng KHÔNG có trong PLACEHOLDERS.md
  UNDOCUMENTED=$(comm -23 <(echo "$FOUND_PLACEHOLDERS") <(echo "$DECLARED_PLACEHOLDERS"))

  # Placeholders trong PLACEHOLDERS.md nhưng KHÔNG dùng trong code (cảnh báo, không fail)
  UNUSED=$(comm -13 <(echo "$FOUND_PLACEHOLDERS") <(echo "$DECLARED_PLACEHOLDERS"))

  CROSS_CHECK_FAILED=0

  if [ -n "$UNDOCUMENTED" ]; then
    echo -e "${RED}✗ Found in code nhưng KHÔNG có entry trong PLACEHOLDERS.md:${NC}"
    echo "$UNDOCUMENTED" | while IFS= read -r p; do
      [ -n "$p" ] && echo -e "  ${RED}${p}${NC}"
    done
    echo ""
    echo "  → Add entry trong PLACEHOLDERS.md hoặc fill placeholder trong code."
    CROSS_CHECK_FAILED=1
  fi

  if [ -n "$UNUSED" ]; then
    echo -e "${YELLOW}⚠ Có trong PLACEHOLDERS.md nhưng KHÔNG dùng trong code (warning only):${NC}"
    echo "$UNUSED" | while IFS= read -r p; do
      [ -n "$p" ] && echo -e "  ${YELLOW}${p}${NC}"
    done
    echo "  → Có thể là placeholder cũ, hoặc chỉ dùng trong documentation."
    echo ""
  fi

  if [ $CROSS_CHECK_FAILED -eq 0 ] && [ -z "$UNDOCUMENTED" ]; then
    echo -e "${GREEN}✓ All placeholders documented in PLACEHOLDERS.md${NC}"
    echo ""
  fi
fi

# ─────────────────────────────────────────────────────────────
# Final exit code
# ─────────────────────────────────────────────────────────────
if [ $TOTAL_PLACEHOLDERS -gt 0 ] || [ "${CROSS_CHECK_FAILED:-0}" = "1" ]; then
  exit 1
fi
exit 0