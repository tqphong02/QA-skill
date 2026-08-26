---
name: support-document-conversion
description: Convert local or uploaded PDF, DOCX, PPTX, XLSX, HTML, image, audio, CSV, JSON, XML, or ZIP artifacts to Markdown for reading, extraction, conversion, or analysis. Trigger on document conversion requests, uploaded artifacts, or local PDF/DOCX/PPTX/XLSX/HTML/image/audio/CSV/JSON/XML/ZIP files. Route Google Drive URLs and IDs to integration-google-drive. Not for editing Markdown or scraping web pages. Auto-route; do not require the skill name.
mode: support
surface: documents
role: conversion
legacy_aliases: doc-to-md
---

## Plugin runtime contract

When this skill is loaded from QA Skill Suite, treat the directory containing this `SKILL.md` as `SKILL_ROOT` and its parent as `PLUGIN_SKILLS_ROOT`. Resolve bundled scripts, references, templates, and sibling skills from those directories. Do not copy plugin assets into the user's project. Invoke a bundled script by its resolved absolute path while keeping the user's project as the working directory, unless that script explicitly requires another working directory.


# Doc to MD

Convert local artifacts with MarkItDown, preserve structure and read back the generated Markdown. Do not retype PDF/DOCX content or pull Drive sources locally just to convert them

## Hard gates and source boundary

- Require an existing local path or chat-uploaded artifact materialized locally
- Route Drive URL/ID and Google Docs/Sheets/Slides objects to `integration-google-drive`; MCP content stays in place
- Never scrape a web page, download remote content implicitly or manually re-key tables/headings
- Preserve source structure, output path/date policy and read the Markdown before handing it to another skill
- Classify missing converter/dependency as `runtime_missing`, not conversion success

## Process

1. Detect extension: `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.html`, `.jpg`, `.png`, `.mp3`, `.wav`, `.csv`, `.json`, `.xml` or `.zip`
2. Resolve `<skill-root>` from the directory containing this `SKILL.md`; never assume `.claude`, `.codex` or `.gemini`
3. Run the bundled converter:

```text
bash <skill-root>/scripts/convert.sh /path/to/input.pdf
bash <skill-root>/scripts/convert.sh /path/to/input.docx /tmp/output.md
bash <skill-root>/scripts/convert.sh /path/to/data.xlsx /tmp/data.md
```

4. Read the `.md` output, not the binary, and preserve heading/requirement references
5. New Markdown uses `_<DD-MM-YYYY>` in `Asia/Ho_Chi_Minh`; avoid duplicate suffixes, do not rename existing files, and set `QA_PRESERVE_EXACT_FILENAME=1` only for an explicit exact-name request

## Supported formats and dependencies

MarkItDown processes PDF/DOCX/PPTX/XLSX/HTML/images locally; OCR needs Tesseract, audio needs ffmpeg plus Whisper, and ZIP is extracted then converted. The script may install MarkItDown; manual fallback:

```text
pip3 install --only-binary=:all: "markitdown[all]"
```

For build/dependency failures, report the exact missing layer; do not upload files to another service. Large/scanned PDFs may need OCR, splitting or a scoped conversion

## Output contract

Report source path, output Markdown path, detected format, conversion status, dependency/runtime status and read-back result. Preserve IDs, URLs, filenames, formulas, code and machine-readable values. Keep credentials and personal sensitive data out of reports

## References

[scripts/convert.sh](scripts/convert.sh) is the canonical wrapper with auto-install and `PYTHON_BIN` support. Use [MarkItDown](https://github.com/microsoft/markitdown) documentation only when converter behavior needs clarification
