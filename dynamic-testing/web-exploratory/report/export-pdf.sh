#!/usr/bin/env bash
# Render an evidence Markdown report to a polished PDF (pandoc + weasyprint + report.css).
#
# Runs pandoc *from the markdown's own directory* so relative image refs
# (img/…/foo.png) resolve. The stylesheet ships next to this script.
#
# Usage:
#   ./export-pdf.sh <report.md> [output.pdf]
# Example:
#   <skill-root>/scripts/export-pdf.sh \
#     docs/automation-test/ingestion-testcases.md
#
# Prereqs: pandoc + weasyprint on PATH (brew install pandoc weasyprint).
set -euo pipefail

MD="${1:?usage: export-pdf.sh <report.md> [output.pdf]}"
OUT="${2:-${MD%.md}.pdf}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CSS="$SCRIPT_DIR/report.css"

MD_ABS="$(cd "$(dirname "$MD")" && pwd)/$(basename "$MD")"
OUT_ABS="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
TITLE="$(basename "${MD%.md}")"

cd "$(dirname "$MD_ABS")"
pandoc "$(basename "$MD_ABS")" -o "$OUT_ABS" \
  --pdf-engine=weasyprint -s --css "$CSS" \
  -f markdown-implicit_figures \
  --metadata title="$TITLE" \
  2>&1 | grep -ivE 'anchor|optimizeLegibility|max-width|overflow-x|user-select|gap:|hyphens|box-shadow' || true

echo "PDF → $OUT_ABS"
