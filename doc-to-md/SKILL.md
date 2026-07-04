---
name: doc-to-md
description: Use when converting PDF/DOCX/PPTX/HTML documents to Markdown for ingestion into other QA skills (testcase-template, qa-run). Not for editing Markdown files or scraping web pages.
---

# Doc to MD

**Core principle:** Convert đúng cấu trúc — không retype thủ công từ PDF.

Dùng **MarkItDown** của Microsoft (open-source MIT) để convert PDF, DOCX, PPTX, XLSX, HTML, ảnh (JPG/PNG với OCR) sang Markdown. File được xử lý 100% local (privacy), không upload cloud. **API key**: KHÔNG cần key cho MarkItDown.

> **Khi nào dùng**: User upload file tài liệu (.pdf, .docx, .pptx, .xlsx, .html, .jpg, .png) và muốn AI đọc hiểu nội dung.
> **Mục đích**: PDF/DOCX gốc khó cho AI parse trực tiếp. Convert sang Markdown trước → AI đọc MD dễ dàng hơn, hiểu sâu hơn.

## The trap this skill exists to prevent

**OCR-by-eye copy-paste** — manually retyping tables and headings from PDFs, losing structure and introducing typos. Always convert via MarkItDown, never re-key content from the source by hand.

## Process

### 1. Detect file format
Check extension `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.html`, `.jpg`, `.png`. Script `convert.sh` auto-detects from extension — no need to specify format.

### 2. Run converter

**Cách 1 — dùng script trực tiếp:**
```bash
# Convert PDF sang MD (output tự động = input.md)
~/.claude/skills/doc-to-md/scripts/convert.sh /path/to/file.pdf

# Convert với output file cụ thể
~/.claude/skills/doc-to-md/scripts/convert.sh /path/to/file.docx /tmp/output.md

# Convert Excel
~/.claude/skills/doc-to-md/scripts/convert.sh /path/to/data.xlsx /tmp/data.md
```

**Cách 2 — AI tự detect và convert** (khi user upload file trong chat):
1. Detect file type (PDF, DOCX, ...)
2. Chạy `~/.claude/skills/doc-to-md/scripts/convert.sh <file>`
3. Đọc file MD output thay vì file gốc
4. Phân tích nội dung và trả lời

**Ví dụ AI workflow**:
```python
import subprocess, os
result = subprocess.run(
    ['bash', os.path.expanduser('~/.claude/skills/doc-to-md/scripts/convert.sh'),
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
| Images | `.jpg`, `.png`, `.gif` | ⭐⭐⭐ - OCR (cần cài Tesseract) |
| Audio | `.mp3`, `.wav` | ⭐⭐⭐ - transcription (cần cài Whisper) |
| CSV | `.csv` | ⭐⭐⭐⭐ |
| JSON/XML | `.json`, `.xml` | ⭐⭐⭐⭐⭐ |
| ZIP | `.zip` | ⭐⭐⭐ - extract và convert từng file |

### 4. Installation

Lần đầu chạy, script tự động install MarkItDown. Nếu fail, install manually:
```bash
pip3 install "markitdown[all]"
```

Optional dependencies cho từng format:
- PDF: cần `pdfminer.six` (auto-install với `[all]`)
- OCR cho ảnh: cần `tesseract` (`brew install tesseract` trên Mac)
- Audio: cần `ffmpeg` + `whisper`

### 5. Example

**Convert PDF spec:**
```bash
$ ~/.claude/skills/doc-to-md/scripts/convert.sh ~/Documents/QA-MDS/BCP-AI/BCP_AI_SRS.docx
🔄 Converting: ~/Documents/QA-MDS/BCP-AI/BCP_AI_SRS.docx → /Users/user/Documents/QA-MDS/BCP-AI/BCP_AI_SRS.md
📦 Installing MarkItDown...
🔄 Converting...
✅ Done: BCP_AI_SRS.md (45,231 bytes, 1,247 lines)
```

**AI dùng sau khi convert:**
```python
with open('BCP_AI_SRS.md') as f:
    spec = f.read()
# Trích requirements
# "FR-M1-01: User đăng ký tài khoản..."
# → gen test case từ requirement
```

## Red flags

| Symptom | Why it's wrong | Fix |
|---|---|---|
| Output MD thiếu table headers | MarkItDown có thể fail với PDF scan | Cài Tesseract OCR hoặc dùng PDF có text layer |
| Audio transcription trả về text rỗng | Whisper chưa cài hoặc ffmpeg sai path | Verify `ffmpeg` trong PATH, cài `openai-whisper` |
| Build wheel fail cho `cryptography` trên macOS | OpenSSL dev headers + Rust thiếu | Dùng `--only-binary=:all:` (xem Common mistakes) |
| PDF > 100 trang convert rất chậm | MarkItDown xử lý tuần tự từng page | Chia nhỏ file hoặc dùng page range filter |

## Common mistakes

- **macOS — cryptography build error:** `pip3 install "markitdown[all]"` hay fail với `Failed building wheel for cryptography`. Nguyên nhân: cần OpenSSL dev headers + Rust, không có sẵn trên macOS, cài qua brew đụng `/usr/local` (nhiều khi cấm trên máy công ty). **Fix dùng wheel prebuilt:**
  ```bash
  pip3 install --only-binary=:all: "markitdown[all]"
  ```
  Verify: `PYTHON_BIN=/usr/local/bin/python3.11 python3 -c "import cryptography; print('OK', cryptography.__version__)"`

- **Nếu vẫn fail** (Python từ pyenv custom, macOS rất cũ):
  - `brew install pkgconf openssl` (cần đổi ownership `/usr/local` — không khuyến nghị trên máy công ty)
  - Hoặc Conda: `conda install -c conda-forge markitdown`

- **Retype thủ công thay vì convert** — mất table structure, sinh typo, tốn thời gian. Luôn chạy convert.sh trước.

- **Upload file lên cloud service khác** — MarkItDown xử lý local, privacy được bảo toàn. Đừng upload trừ khi user yêu cầu rõ.

- **Convert audio mà chưa cài Whisper** — script sẽ silent fail hoặc trả empty. Cài ffmpeg + openai-whisper trước.

- **Large PDF > 100 trang** — có thể chậm vài giây. Cân nhắc chia nhỏ hoặc chỉ convert phần liên quan.

## References

- [scripts/convert.sh](scripts/convert.sh) — wrapper script với auto-install + PYTHON_BIN override
- [MarkItDown (Microsoft)](https://github.com/microsoft/markitdown) — upstream open-source tool