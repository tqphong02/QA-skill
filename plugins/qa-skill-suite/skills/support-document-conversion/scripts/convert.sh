#!/usr/bin/env bash
# ../scripts/convert.sh - Convert document to Markdown using MarkItDown
# Usage: ./convert.sh input.pdf [output.md]
#        ./convert.sh input.docx
#        ./convert.sh input.xlsx output.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

# Validate arguments before reading positional parameters because `set -u`
# treats an omitted `$1` as an error
if [ "$#" -lt 1 ] || [ -z "${1:-}" ]; then
  echo "Usage: $0 <input_file> [output_file]"
  echo ""
  echo "Supported formats: PDF, DOCX, PPTX, XLSX, HTML, JPG/PNG, MP3, etc."
  echo ""
  echo "Examples:"
  echo "  $0 spec.pdf              # → spec_DD-MM-YYYY.md"
  echo "  $0 spec.docx output.md   # → output_DD-MM-YYYY.md"
  exit 1
fi

# Default output
INPUT="$1"

if [ ! -f "$INPUT" ]; then
  echo "❌ File not found: $INPUT"
  exit 1
fi

REQUESTED_OUTPUT="${2:-${INPUT%.*}.md}"
ARTIFACT_DATE="${QA_ARTIFACT_DATE:-$(TZ=Asia/Ho_Chi_Minh date +%d-%m-%Y)}"

if [[ ! "$ARTIFACT_DATE" =~ ^[0-9]{2}-[0-9]{2}-[0-9]{4}$ ]]; then
  echo "❌ QA_ARTIFACT_DATE must use DD-MM-YYYY: $ARTIFACT_DATE"
  exit 1
fi

if [ "${QA_PRESERVE_EXACT_FILENAME:-0}" = "1" ]; then
  OUTPUT="$REQUESTED_OUTPUT"
else
  OUTPUT_DIR="$(dirname "$REQUESTED_OUTPUT")"
  OUTPUT_FILE="$(basename "$REQUESTED_OUTPUT")"
  OUTPUT_EXT="${OUTPUT_FILE##*.}"
  OUTPUT_STEM="${OUTPUT_FILE%.*}"
  if [[ "$OUTPUT_STEM" =~ _[0-9]{2}-[0-9]{2}-[0-9]{4}$ ]]; then
    OUTPUT="$REQUESTED_OUTPUT"
  else
    OUTPUT="$OUTPUT_DIR/${OUTPUT_STEM}_${ARTIFACT_DATE}.${OUTPUT_EXT}"
  fi
fi

# Find Python 3.10+ (MarkItDown requires 3.10+)
# Allow override via env var: PYTHON_BIN=/path/to/python3.11 bash convert.sh ...
PYTHON_BIN="${PYTHON_BIN:-}"
if [ -z "$PYTHON_BIN" ]; then
  for py in python3.12 python3.11 python3.10 /usr/bin/python3 /usr/local/bin/python3; do
    if command -v "$py" &>/dev/null; then
      version=$("$py" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "0.0")
      major=$(echo "$version" | cut -d. -f1)
      minor=$(echo "$version" | cut -d. -f2)
      if [ "$major" -ge 3 ] && [ "$minor" -ge 10 ] 2>/dev/null; then
        PYTHON_BIN="$py"
        break
      fi
    fi
  done
fi

if [ -z "$PYTHON_BIN" ]; then
  echo "❌ Cần Python 3.10+ để chạy MarkItDown. Hệ thống đang dùng Python cũ hơn."
  echo ""
  echo "Cài Python 3.10+ (chọn 1 cách):"
  echo "  macOS:  brew install python@3.11"
  echo "  Linux:  sudo apt install python3.11"
  echo "  Win:    https://www.python.org/downloads/"
  echo ""
  echo "Sau đó chạy lại: $0 $INPUT"
  exit 1
fi

# Check if markitdown is installed for the chosen Python
if ! "$PYTHON_BIN" -c "import markitdown; from markitdown import MarkItDown" 2>/dev/null; then
  echo "📦 Installing MarkItDown using $PYTHON_BIN..."
  "$PYTHON_BIN" -m pip install --quiet "markitdown[all]" 2>&1 | tail -3 || {
    echo "❌ pip install failed. Cài manual: $PYTHON_BIN -m pip install 'markitdown[all]'"
    exit 1
  }
fi

echo "🔄 Converting: $INPUT → $OUTPUT (using $PYTHON_BIN)"

# Pass paths as argv instead of interpolating them into Python source so names
# containing quotes, spaces, backslashes, or Unicode remain safe
"$PYTHON_BIN" - "$INPUT" "$OUTPUT" <<'PY' 2>&1
from pathlib import Path
import sys

from markitdown import MarkItDown

input_path = sys.argv[1]
output_path = Path(sys.argv[2])
result = MarkItDown().convert(input_path)
output_path.write_text(result.text_content, encoding="utf-8")
PY

if [ -f "$OUTPUT" ]; then
  SIZE=$(wc -c < "$OUTPUT")
  LINES=$(wc -l < "$OUTPUT")
  echo "✅ Done: $OUTPUT ($SIZE bytes, $LINES lines)"
else
  echo "❌ Conversion failed"
  exit 1
fi
