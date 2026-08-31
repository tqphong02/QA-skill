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

if command -v cygpath >/dev/null 2>&1; then
  [[ "$INPUT" =~ ^[A-Za-z]:[\\/] ]] && INPUT="$(cygpath -u "$INPUT")"
  [[ "$OUTPUT_DIR" =~ ^[A-Za-z]:[\\/] ]] && OUTPUT_DIR="$(cygpath -u "$OUTPUT_DIR")"
fi

PYTHON_CMD=()
if [[ -n "${QA_SKILL_PYTHON:-}" ]]; then
  PYTHON_CMD=("$QA_SKILL_PYTHON")
elif command -v python3 >/dev/null 2>&1 && python3 -c 'import openpyxl' >/dev/null 2>&1; then
  PYTHON_CMD=(python3)
elif command -v python >/dev/null 2>&1 && python -c 'import openpyxl' >/dev/null 2>&1; then
  PYTHON_CMD=(python)
else
  if [[ -n "${LOCALAPPDATA:-}" ]]; then
    for candidate in "$LOCALAPPDATA"/Programs/Python/Python*/python.exe; do
      if [[ -x "$candidate" ]] && "$candidate" -c 'import openpyxl' >/dev/null 2>&1; then
        PYTHON_CMD=("$candidate")
      fi
    done
  fi
  if [[ ${#PYTHON_CMD[@]} -eq 0 ]] && command -v py >/dev/null 2>&1 && py -3.12 -c 'import openpyxl' >/dev/null 2>&1; then
    PYTHON_CMD=(py -3.12)
  fi
  if [[ ${#PYTHON_CMD[@]} -eq 0 ]]; then
    echo "Missing runnable Python runtime with openpyxl"
    exit 1
  fi
fi

if [[ ! -f "$INPUT" ]]; then
  echo "Analysis JSON not found: $INPUT"
  exit 1
fi

node "$SCRIPT_DIR/doctor.mjs"

if ! (cd "$SKILL_DIR" && node -e "import('xmindmark')" --input-type=module) >/dev/null 2>&1; then
  echo "Missing xmindmark dependency"
  echo "Run: npm install --omit=dev --prefix $SKILL_DIR"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
STATE_PATH="$OUTPUT_DIR/.static-testing/requirements-analysis/${BASE_NAME}_Analysis_State.json"
"${PYTHON_CMD[@]}" "$SCRIPT_DIR/convergence.py" --check "$INPUT" "$STATE_PATH"
"${PYTHON_CMD[@]}" "$SCRIPT_DIR/render-qa.py" "$INPUT" "$OUTPUT_DIR" "$BASE_NAME"
node "$SCRIPT_DIR/render-xmind.mjs" "$INPUT" "$OUTPUT_DIR/${BASE_NAME}_Business_Flow.xmind"
"${PYTHON_CMD[@]}" "$SCRIPT_DIR/render-qa.py" --check \
  "$OUTPUT_DIR/${BASE_NAME}_Q&A.md" \
  "$OUTPUT_DIR/${BASE_NAME}_Q&A.xlsx" \
  "$INPUT"
node "$SCRIPT_DIR/render-xmind.mjs" --check "$OUTPUT_DIR/${BASE_NAME}_Business_Flow.xmind" "$INPUT"
"${PYTHON_CMD[@]}" "$SCRIPT_DIR/export-requirements.py" \
  "$INPUT" \
  "$OUTPUT_DIR/.static-testing/requirements-analysis/${BASE_NAME}_Requirements.json" \
  "$OUTPUT_DIR/.static-testing/requirements-analysis/${BASE_NAME}_API_Contract_Handoff.json"
"${PYTHON_CMD[@]}" "$SCRIPT_DIR/convergence.py" --commit "$INPUT" "$STATE_PATH"

echo "BUSINESS ANALYSIS PASS"
echo "$OUTPUT_DIR/${BASE_NAME}_Business_Flow.xmind"
echo "$OUTPUT_DIR/${BASE_NAME}_Q&A.md"
echo "$OUTPUT_DIR/${BASE_NAME}_Q&A.xlsx"
