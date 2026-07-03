#!/usr/bin/env bash
# doc-to-md/scripts/convert.sh - Convert document to Markdown using MarkItDown
# Usage: ./convert.sh input.pdf [output.md]
#        ./convert.sh input.docx
#        ./convert.sh input.xlsx output.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
MARKITDOWN_DIR="$SKILL_DIR/vendor/markitdown"

# Default output
INPUT="$1"
if [ -z "$INPUT" ]; then
  echo "Usage: $0 <input_file> [output_file]"
  echo ""
  echo "Supported formats: PDF, DOCX, PPTX, XLSX, HTML, JPG/PNG, MP3, etc."
  echo ""
  echo "Examples:"
  echo "  $0 spec.pdf              # → spec.md"
  echo "  $0 spec.docx output.md   # → output.md"
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  echo "❌ File not found: $INPUT"
  exit 1
fi

OUTPUT="${2:-${INPUT%.*}.md}"

# Find Python 3.10+ (MarkItDown requires 3.10+)
PYTHON_BIN=""
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

# Use the MarkItDown Python API
"$PYTHON_BIN" -c "
from markitdown import MarkItDown
md = MarkItDown()
result = md.convert('$INPUT')
with open('$OUTPUT', 'w', encoding='utf-8') as f:
    f.write(result.text_content)
" 2>&1

if [ -f "$OUTPUT" ]; then
  SIZE=$(wc -c < "$OUTPUT")
  LINES=$(wc -l < "$OUTPUT")
  echo "✅ Done: $OUTPUT ($SIZE bytes, $LINES lines)"
else
  echo "❌ Conversion failed"
  exit 1
fi
