---
name: doc-to-md
description: Convert PDF/DOCX/PPTX/XLSX/HTML/images sang Markdown bằng MarkItDown (Microsoft open-source). Khi user upload file business spec, tài liệu requirement, báo cáo - tự động convert sang MD để AI đọc hiểu nội dung. Hỗ trợ OCR cho ảnh scan, table extraction từ PDF. Dùng khi: user upload file .pdf/.docx/.pptx/.xlsx, "đọc file này", "convert doc sang markdown", "tài liệu này nói gì", "extract text từ PDF".
---

# doc-to-md — Convert document sang Markdown

Dùng **MarkItDown** của Microsoft (open-source MIT) để convert PDF, DOCX, PPTX, XLSX, HTML, ảnh (JPG/PNG với OCR) sang Markdown.

> **Khi nào dùng**: User upload file tài liệu (.pdf, .docx, .pptx, .xlsx, .html, .jpg, .png) và muốn AI đọc hiểu nội dung.
> **Mục đích**: PDF/DOCX gốc khó cho AI parse trực tiếp. Convert sang Markdown trước → AI đọc MD dễ dàng hơn, hiểu sâu hơn.
> **API key**: KHÔNG cần key cho MarkItDown (chạy local).

## Workflow

### 1. User upload file → 2. Auto convert → 3. AI đọc MD → 4. Trả lời user

```
User upload file.pdf
       ↓
[convert.sh] → file.md (Markdown)
       ↓
AI đọc file.md → trả lời user
```

## Cách dùng

### Cách 1: Dùng script trực tiếp

```bash
# Convert PDF sang MD (output tự động = input.md)
~/.claude/skills/doc-to-md/scripts/convert.sh /path/to/file.pdf

# Convert với output file cụ thể
~/.claude/skills/doc-to-md/scripts/convert.sh /path/to/file.docx /tmp/output.md

# Convert Excel
~/.claude/skills/doc-to-md/scripts/convert.sh /path/to/data.xlsx /tmp/data.md
```

### Cách 2: AI tự detect và convert

Khi user upload file trong chat, AI nên:
1. Detect file type (PDF, DOCX, ...)
2. Chạy `~/.claude/skills/doc-to-md/scripts/convert.sh <file>` 
3. Đọc file MD output thay vì file gốc
4. Phân tích nội dung và trả lời

**Ví dụ AI workflow**:
```python
import subprocess
import os

# Khi user upload spec.pdf
result = subprocess.run(
    ['bash', os.path.expanduser('~/.claude/skills/doc-to-md/scripts/convert.sh'),
     '/path/to/spec.pdf', '/tmp/spec.md'],
    capture_output=True, text=True
)
# Đọc /tmp/spec.md
with open('/tmp/spec.md', 'r') as f:
    content = f.read()
# Phân tích content thay vì parse PDF trực tiếp
```

## Supported formats

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

## Installation

Lần đầu chạy, script tự động install MarkItDown. Nếu fail, install manually:

```bash
pip3 install "markitdown[all]"
```

Optional dependencies cho từng format:
- PDF: cần `pdfminer.six` (auto-install với `[all]`)
- OCR cho ảnh: cần `tesseract` (`brew install tesseract` trên Mac)
- Audio: cần `ffmpeg` + `whisper`

### ⚠️ macOS — cryptography build error (thường gặp trên máy công ty)

`markitdown[all]` kéo `cryptography` (qua `[pdf]` + `[azure]`). Trên macOS, `pip install "markitdown[all]"` hay fail với:
```
Failed building wheel for cryptography
ERROR: Could not build wheels for cryptography
```

Nguyên nhân: `cryptography` cần **OpenSSL development headers** + **Rust** để build từ source — macOS không có sẵn, và cài qua brew đụng `/usr/local` (nhiều khi cấm trên máy công ty).

**Fix đơn giản (dùng wheel prebuilt, KHÔNG cần build):**

```bash
pip3 install --only-binary=:all: "markitdown[all]"
```

Pip tự tải wheel `cryptography-*-macosx_*_universal2.whl` đã build sẵn từ PyPI (universal binary cho cả Intel + Apple Silicon) — không cần OpenSSL dev, không cần Rust, không cần quyền admin.

**Verify thành công:**
```bash
PYTHON_BIN=/usr/local/bin/python3.11 python3 -c "import cryptography; print('OK', cryptography.__version__)"
# → OK 48.0.1
```

Sau đó chạy `convert.sh` bình thường:
```bash
~/.claude/skills/doc-to-md/scripts/convert.sh ~/Documents/spec.pdf
```

**Nếu vẫn fail** (vd Python từ pyenv custom, macOS rất cũ):
- Cài `pkg-config` + OpenSSL: `brew install pkgconf openssl` (cần đổi ownership `/usr/local` — KHÔNG khuyến nghị trên máy công ty)
- Dùng Conda thay pip: `conda install -c conda-forge markitdown`

## Ví dụ

### Convert PDF spec
```bash
$ ~/.claude/skills/doc-to-md/scripts/convert.sh ~/Documents/QA-MDS/BCP-AI/BCP_AI_SRS.docx
🔄 Converting: ~/Documents/QA-MDS/BCP-AI/BCP_AI_SRS.docx → /Users/user/Documents/QA-MDS/BCP-AI/BCP_AI_SRS.md
📦 Installing MarkItDown...
🔄 Converting...
✅ Done: BCP_AI_SRS.md (45,231 bytes, 1,247 lines)
```

### AI dùng
```python
# Đọc file MD
with open('BCP_AI_SRS.md') as f:
    spec = f.read()

# Trích requirements
# "FR-M1-01: User đăng ký tài khoản..."
# → gen test case từ requirement
```

## Notes

- **Không mất format**: Bảng, heading, list, code block đều giữ nguyên format
- **OCR support**: Cài `tesseract` để enable OCR cho ảnh scan
- **Local processing**: File KHÔNG upload lên cloud, xử lý 100% trên máy user (privacy)
- **Auto-detect format**: Không cần chỉ định format, script tự detect từ extension
- **Large files**: PDF > 100 trang có thể chậm (vài giây)
