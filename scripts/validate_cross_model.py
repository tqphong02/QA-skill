#!/usr/bin/env python3
"""Validate cross-model hard gates shared by QA-skill entrypoints."""

from pathlib import Path
import ast
import sys


ROOT = Path(__file__).resolve().parents[1]

REQUIRED = {
    "AGENTS.md": [
        "Cross-model deterministic mode",
        "PASS → `Done`",
        "FAILED → `In Progress`",
        "BLOCKED → giữ nguyên trạng thái",
        "Bug mới → `Todo`",
        "RETEST_PLUS",
        "google-drive-qa/SKILL.md",
        "plane-qa/SKILL.md",
    ],
    "GEMINI.md": [
        "Cross-model deterministic mode",
        "PASS → `Done`",
        "RETEST_PLUS",
        "google-drive-qa/SKILL.md",
        "plane-qa/SKILL.md",
    ],
    ".github/copilot-instructions.md": [
        "RETEST_PLUS",
        "PASS moves to `Done`",
        "Drive MCP",
        "no terminal `.` and no emoji/icon",
    ],
    "MODEL-COMPATIBILITY.md": [
        "Retest <Plane URL>",
        "Test feature này không có doc/testcase",
        "Update Google Sheet <URL>",
        "Static check",
    ],
    "qa-run/SKILL.md": [
        "Cross-model hard gates",
        "Retest, Sanity, Impacted regression, Exploratory, Ad-hoc, UI/UX",
        "PASS → Done",
        "FAILED → In Progress",
    ],
    "testcase-template/SKILL.md": [
        "Cross-model hard gates",
        "Không đặt dấu `.`",
        "Không chèn emoji/icon",
    ],
    "plane-qa/SKILL.md": [
        "Cross-model hard gates",
        "PASS → Done",
        "FAILED → In Progress",
        "new bug → Todo",
    ],
    "plane-qa/comments/post-result.py": [
        '"PASS": "Done"',
        '"FAILED": "In Progress"',
        "clean_sentence",
    ],
    "google-drive-qa/SKILL.md": [
        "Cross-model hard gates",
        "google-drive` MCP",
        "Read the affected object back",
    ],
    "testcase-template/scripts/gen-testcases.py": [
        "def human_text",
        "ICON_RE",
        "rstrip('.')",
    ],
    "scripts/setup_lib.sh": [
        '"plane-qa"',
        '"google-drive-qa"',
    ],
}


def main():
    failures = []
    for relative, needles in REQUIRED.items():
        path = ROOT / relative
        if not path.is_file():
            failures.append(f"missing file: {relative}")
            continue
        text = path.read_text(encoding="utf-8")
        for needle in needles:
            if needle not in text:
                failures.append(f"{relative}: missing contract token {needle!r}")

    for relative in (
        "plane-qa/comments/post-result.py",
        "plane-qa/comments/post-inline.py",
        "plane-qa/utils/inline_image.py",
        "google-drive-qa/scripts/drive_auth_doctor.py",
        "google-drive-qa/scripts/drive_upload.py",
        "testcase-template/scripts/gen-testcases.py",
    ):
        path = ROOT / relative
        if path.is_file():
            try:
                ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            except SyntaxError as exc:
                failures.append(f"{relative}: syntax error: {exc}")

    if failures:
        print("CROSS-MODEL CONTRACT FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print(f"CROSS-MODEL CONTRACT PASS: {len(REQUIRED)} entrypoints checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
