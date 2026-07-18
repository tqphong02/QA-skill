#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: generate.sh <analysis.json> <output-dir> [base-name]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
INPUT="$1"
OUTPUT_DIR="$2"
BASE_NAME="${3:-business}"

if [[ ! -f "$INPUT" ]]; then
  echo "Analysis JSON not found: $INPUT"
  exit 1
fi

if ! (cd "$SKILL_DIR" && node -e "import('xmindmark')" --input-type=module) >/dev/null 2>&1; then
  echo "Missing xmindmark dependency"
  echo "Run: npm install --omit=dev --prefix $SKILL_DIR"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
python3 "$SCRIPT_DIR/render-qa.py" "$INPUT" "$OUTPUT_DIR" "$BASE_NAME"
node "$SCRIPT_DIR/render-xmind.mjs" "$INPUT" "$OUTPUT_DIR/${BASE_NAME}_Business_Flow.xmind"
python3 "$SCRIPT_DIR/render-qa.py" --check \
  "$OUTPUT_DIR/${BASE_NAME}_Q&A.md" \
  "$OUTPUT_DIR/${BASE_NAME}_Q&A.xlsx"
node "$SCRIPT_DIR/render-xmind.mjs" --check "$OUTPUT_DIR/${BASE_NAME}_Business_Flow.xmind"

echo "BUSINESS ANALYSIS PASS"
echo "$OUTPUT_DIR/${BASE_NAME}_Business_Flow.xmind"
echo "$OUTPUT_DIR/${BASE_NAME}_Q&A.md"
echo "$OUTPUT_DIR/${BASE_NAME}_Q&A.xlsx"
