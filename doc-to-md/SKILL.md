---
name: doc-to-md
description: Convert local filesystem or chat-uploaded PDF, DOCX, PPTX, XLSX, HTML, image, audio, CSV, JSON, XML, or ZIP files to Markdown for ingestion into other QA skills. Use only when the source already exists as a local file path. Do not use for Google Drive URLs, IDs, Docs, Sheets, Slides, or other remote Drive objects; keep those sources on the google-drive MCP route unless the user explicitly requested a local download or export first. Not for editing Markdown files or scraping web pages.
---

# Doc to MD

**Core principle:** Only convert local files with correct structure — do not retype manually from PDFs and do not pull Drive sources locally just to convert them.

Uses Microsoft's **MarkItDown** (open-source MIT) to convert PDF, DOCX, PPTX, XLSX, HTML, images (JPG/PNG with OCR) to Markdown. Files are processed 100% locally (privacy), no cloud uploads. **API key**: NO key required for MarkItDown.

> **When to use**: User uploads a document file (.pdf, .docx, .pptx, .xlsx, .html, .jpg, .png) and wants the AI to read its content.
> **Purpose**: Raw PDF/DOCX files are hard for AI to parse directly. Convert to Markdown first → AI reads MD much easier and understands deeper context.

## Source boundary

1. Require a real local filesystem path before running `convert.sh`.
2. Treat a chat-uploaded file materialized as a local path as local input.
3. Treat a Google Drive URL, Drive ID, Google Docs URL, Google Sheets URL, Google Slides URL, or object resolved through Drive MCP as a remote Drive source.
4. For a remote Drive source, stop this skill and route the request to `google-drive-qa`; consume the in-place MCP content directly.
5. Do not download, export, or copy a Drive source locally merely to make it eligible for this skill.
6. Allow conversion after a Drive download or export only when the user explicitly requested that local artifact.
7. For mixed sources, convert only the local files and leave Drive objects on the MCP route.

## The trap this skill exists to prevent

**OCR-by-eye copy-paste** — manually retyping tables and headings from PDFs, losing structure and introducing typos. Always convert via MarkItDown, never re-key content from the source by hand.

## Process

### 1. Detect file format
Verify that the input is an existing local path, then check extension `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.html`, `.jpg`, `.png`. Script `convert.sh` auto-detects from extension — no need to specify format. If the input is a Drive URL or ID, do not run the converter.

### 2. Run converter

**Method 1 — run script directly:**
```bash
# Convert PDF to MD (auto output = input_DD-MM-YYYY.md)
bash <skill-root>/scripts/convert.sh /path/to/file.pdf

# Convert with specific output base; script still appends date
bash <skill-root>/scripts/convert.sh /path/to/file.docx /tmp/output.md

# Convert Excel
bash <skill-root>/scripts/convert.sh /path/to/data.xlsx /tmp/data.md
```

Resolve `<skill-root>` from the directory containing the loaded `SKILL.md`. Do not assume the skill is located in `.claude`, `.codex`, `.gemini` or a specific home directory.

All new Markdown files use the `_DD-MM-YYYY` suffix based on `Asia/Ho_Chi_Minh` time, e.g., `FRS_20-07-2026.md`. Do not append the date twice if the basename already has the correct suffix. Do not rename existing files. If the user explicitly requests keeping the exact filename, run with `QA_PRESERVE_EXACT_FILENAME=1`.

**Method 2 — AI auto-detects and converts** (when user uploads a file in chat):
1. Detect file type (PDF, DOCX, ...)
2. Run `bash <skill-root>/scripts/convert.sh <file>`
3. Read the MD output file instead of the original file
4. Analyze the content and respond

**AI workflow example**:
```python
import os, subprocess
skill_root = os.environ['DOC_TO_MD_SKILL_DIR']
result = subprocess.run(
    ['bash', os.path.join(skill_root, 'scripts', 'convert.sh'),
     '/path/to/spec.pdf', '/tmp/spec.md'],
    capture_output=True, text=True
)
with open('/tmp/spec.md', 'r') as f:
    content = f.read()
# Phân tích content thay vì parse PDF trực tiếp
```

### 3. Supported formats

| Format | Extension | Output quality |
|---|---|---|
| PDF | `.pdf` | ⭐⭐⭐⭐ - text + tables + structure |
| Word | `.docx`, `.doc` | ⭐⭐⭐⭐⭐ - perfect |
| PowerPoint | `.pptx`, `.ppt` | ⭐⭐⭐⭐⭐ - slides + notes |
| Excel | `.xlsx`, `.xls` | ⭐⭐⭐⭐⭐ - tables + sheets |
| HTML | `.html`, `.htm` | ⭐⭐⭐⭐⭐ |
| Images | `.jpg`, `.png`, `.gif` | ⭐⭐⭐ - OCR (requires Tesseract) |
| Audio | `.mp3`, `.wav` | ⭐⭐⭐ - transcription (requires Whisper) |
| CSV | `.csv` | ⭐⭐⭐⭐ |
| JSON/XML | `.json`, `.xml` | ⭐⭐⭐⭐⭐ |
| ZIP | `.zip` | ⭐⭐⭐ - extract and convert each file |

### 4. Installation

First time running, the script auto-installs MarkItDown. If it fails, install manually:
```bash
pip3 install "markitdown[all]"
```

Optional dependencies per format:
- PDF: requires `pdfminer.six` (auto-installed with `[all]`)
- Image OCR: requires `tesseract` (`brew install tesseract` on Mac)
- Audio: requires `ffmpeg` + `whisper`

### 5. Example

**Document conversion:**
```bash
$ QA_ARTIFACT_DATE=20-07-2026 bash <skill-root>/scripts/convert.sh /project/spec/FRS.docx
🔄 Converting: /project/spec/FRS.docx → /project/spec/FRS_20-07-2026.md
📦 Installing MarkItDown...
🔄 Converting...
✅ Done: FRS_20-07-2026.md (45,231 bytes, 1,247 lines)
```

**AI usage after conversion:**
```python
with open('BCP_AI_SRS.md') as f:
    spec = f.read()
# Extract requirements
# "FR-M1-01: User registers account..."
# → generate test cases from requirement
```

## Red flags

| Symptom | Why it's wrong | Fix |
|---|---|---|
| Output MD missing table headers | MarkItDown can fail on scanned PDFs | Install Tesseract OCR or use a PDF with a text layer |
| Audio transcription returns empty text | Whisper not installed or ffmpeg bad path | Verify `ffmpeg` in PATH, install `openai-whisper` |
| Build wheel fails for `cryptography` on macOS | Missing OpenSSL dev headers + Rust | Use `--only-binary=:all:` (see Common mistakes) |
| Large PDF > 100 pages converts very slowly | MarkItDown processes each page sequentially | Split file or use a page range filter |

## Common mistakes

- **macOS — cryptography build error:** `pip3 install "markitdown[all]"` often fails with `Failed building wheel for cryptography`. Cause: OpenSSL dev headers + Rust are missing, and installing via brew hits `/usr/local` permissions (often blocked on corporate laptops). **Fix by using prebuilt wheel:**
  ```bash
  pip3 install --only-binary=:all: "markitdown[all]"
  ```
  Verify: `PYTHON_BIN=/usr/local/bin/python3.11 python3 -c "import cryptography; print('OK', cryptography.__version__)"`

- **If it still fails** (custom pyenv Python, very old macOS):
  - `brew install pkgconf openssl` (requires `/usr/local` ownership change — not recommended on corporate laptops)
  - Or Conda: `conda install -c conda-forge markitdown`

- **Manual retyping instead of converting** — loses table structure, introduces typos, wastes time. Always run `convert.sh` first.

- **Downloading Drive objects to convert when user only asked to read/analyze** — wrong source route and creates unnecessary local snapshots. Use `google-drive` MCP for in-place reading; only convert when user explicitly requests a local copy.

- **Uploading files to other cloud services** — MarkItDown processes locally, preserving privacy. Do not upload unless the user explicitly requests it.

- **Converting audio without Whisper installed** — script will fail silently or return empty. Install ffmpeg + openai-whisper first.

- **Large PDFs > 100 pages** — may take several seconds. Consider splitting or converting only relevant sections.

## References

- [scripts/convert.sh](scripts/convert.sh) — wrapper script với auto-install + PYTHON_BIN override
- [MarkItDown (Microsoft)](https://github.com/microsoft/markitdown) — upstream open-source tool
