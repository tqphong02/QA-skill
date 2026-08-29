---
name: support-document-conversion
description: Convert local or uploaded PDF, DOCX, PPTX, XLSX, HTML, image, audio, CSV, JSON, XML, or ZIP artifacts to Markdown for reading, extraction, conversion, or analysis. Trigger on document conversion requests, uploaded artifacts, or local PDF/DOCX/PPTX/XLSX/HTML/image/audio/CSV/JSON/XML/ZIP files. Route Google Drive URLs and IDs to integration-google-drive. Not for editing Markdown or scraping web pages. Auto-route; do not require the skill name.
mode: support
surface: documents
role: conversion
legacy_aliases: doc-to-md
---

<!-- qa-runs-contract:start -->
## Local run organization

When this workflow creates local reports, evidence, logs, converted intermediates, or other non-source deliverables and the user did not request an exact output path:

1. Start a fresh run with `node <skill-root>/scripts/qa-runs.mjs start --skill <skill-name> --label <short-scope>` when the bundled helper exists. In a QA-skill source checkout use `<repo-root>/scripts/qa-runs.mjs`. If neither helper exists, create the same layout manually
2. Keep every run-owned file under the returned `<project-root>/qa-runs/<skill-name>/<timestamp>_<scope>/` directory. Never emit generated files into the project root or overwrite an earlier run
3. Put the primary human-readable summary at `report.md` when the output format permits. Preserve required machine-readable and native filenames inside the same run directory
4. Finish the run with `qa-runs.mjs finish --run-dir <run-dir> --status <status> [--primary <report-path>]` so `LATEST.md`, `INDEX.md`, root `latest.json`, and per-skill `latest.json` point to the newest run
5. In the final response, link the primary report, the timestamped run directory, and `qa-runs/INDEX.md`; identify the run ID and status explicitly

An exact user path, a source-code deliverable that belongs in the target repository, or a safety-mandated location overrides this layout. Register or link the result without copying secrets or sensitive evidence into the index
<!-- qa-runs-contract:end -->
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
