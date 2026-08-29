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

PYTHON_BIN="${QA_SKILL_PYTHON:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  else
    echo "Missing Python runtime"
    exit 1
  fi
fi

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
STATE_PATH="$OUTPUT_DIR/.static-testing/requirements-analysis/${BASE_NAME}_Analysis_State.json"
"$PYTHON_BIN" "$SCRIPT_DIR/convergence.py" --check "$INPUT" "$STATE_PATH"
"$PYTHON_BIN" "$SCRIPT_DIR/render-qa.py" "$INPUT" "$OUTPUT_DIR" "$BASE_NAME"
node "$SCRIPT_DIR/render-xmind.mjs" "$INPUT" "$OUTPUT_DIR/${BASE_NAME}_Business_Flow.xmind"
"$PYTHON_BIN" "$SCRIPT_DIR/render-qa.py" --check \
  "$OUTPUT_DIR/${BASE_NAME}_Q&A.md" \
  "$OUTPUT_DIR/${BASE_NAME}_Q&A.xlsx"
node "$SCRIPT_DIR/render-xmind.mjs" --check "$OUTPUT_DIR/${BASE_NAME}_Business_Flow.xmind" "$INPUT"
"$PYTHON_BIN" "$SCRIPT_DIR/export-requirements.py" \
  "$INPUT" \
  "$OUTPUT_DIR/.static-testing/requirements-analysis/${BASE_NAME}_Requirements.json"
"$PYTHON_BIN" "$SCRIPT_DIR/convergence.py" --commit "$INPUT" "$STATE_PATH"

echo "BUSINESS ANALYSIS PASS"
echo "$OUTPUT_DIR/${BASE_NAME}_Business_Flow.xmind"
echo "$OUTPUT_DIR/${BASE_NAME}_Q&A.md"
echo "$OUTPUT_DIR/${BASE_NAME}_Q&A.xlsx"
