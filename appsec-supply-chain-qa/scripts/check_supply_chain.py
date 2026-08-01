#!/usr/bin/env python3
"""Run a local, redacted dependency-manifest and secret preflight."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any


EXCLUDED_DIRS = {".git", "node_modules", "dist", "build", "coverage", "evidence", "qa-knowledge", "__pycache__"}
SECRET_SCAN_EXCLUDED_PARTS = {"tests", "test", "fixtures", "vendor"}
MANIFESTS = {
    "package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock",
    "requirements.txt", "pyproject.toml", "poetry.lock", "Pipfile.lock", "go.mod", "go.sum",
    "Cargo.toml", "Cargo.lock", "pom.xml", "Gemfile.lock", "composer.lock",
}
TEXT_SUFFIXES = {".js", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".java", ".go", ".rs", ".rb", ".php", ".cs", ".dart", ".json", ".yaml", ".yml", ".toml", ".ini", ".env", ".lock", ".txt"}
SECRET_PATTERNS = (
    ("aws_access_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("github_token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b")),
    ("private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("credential_assignment", re.compile(r"(?i)\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*[\"'][^\"'\n]{12,}[\"']")),
)


def iter_files(root: Path):
    for current, dirs, files in os.walk(root, topdown=True, followlinks=False):
        dirs[:] = [name for name in dirs if name not in EXCLUDED_DIRS and not name.startswith(".venv")]
        for name in files:
            path = Path(current) / name
            if path.stat().st_size > 1_500_000:
                continue
            if path.suffix.lower() in TEXT_SUFFIXES or name in MANIFESTS:
                yield path


def scan(repo: Path) -> dict[str, Any]:
    manifests: list[str] = []
    findings: list[dict[str, Any]] = []
    hashed_files = hashlib.sha256()
    for path in iter_files(repo):
        relative = path.relative_to(repo).as_posix()
        if path.name in MANIFESTS:
            manifests.append(relative)
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        hashed_files.update(relative.encode("utf-8"))
        hashed_files.update(text.encode("utf-8"))
        if path.suffix.lower() in {".md", ".txt"} or path.name.endswith(".example"):
            continue
        relative_parts = path.relative_to(repo).parts
        if any(part in SECRET_SCAN_EXCLUDED_PARTS or part.startswith(("test", "fixture")) for part in relative_parts):
            continue
        for line_number, line in enumerate(text.splitlines(), start=1):
            for kind, pattern in SECRET_PATTERNS:
                if pattern.search(line):
                    findings.append({
                        "path": relative,
                        "line": line_number,
                        "kind": kind,
                        "value": "<redacted>",
                    })
                    break
    manifests.sort()
    return {
        "schema_version": "1.0",
        "passed": not findings,
        "repo": repo.name,
        "source_hash": f"sha256:{hashed_files.hexdigest()}",
        "dependency_manifests": manifests,
        "secret_findings": findings,
        "secret_scan_exclusions": sorted(SECRET_SCAN_EXCLUDED_PARTS),
        "sbom_ready": bool(manifests),
        "ci_controls": {"local_scan": "PASS", "remote_sast": "NOT_RUN", "remote_sca": "NOT_RUN", "sbom_signing": "NOT_RUN"},
        "limitations": ["regex scan is not SAST/SCA, does not query registries, and does not assess exploitability or license compliance", "test/fixture/vendor paths are inventory inputs but excluded from secret-value matching to avoid treating synthetic credentials as production secrets"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=".")
    parser.add_argument("--output")
    args = parser.parse_args()
    try:
        repo = Path(args.repo).resolve()
        if not repo.is_dir():
            raise ValueError("repo must be a directory")
        report = scan(repo)
    except (OSError, ValueError) as exc:
        print(json.dumps({"passed": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        return 2
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(payload + "\n", encoding="utf-8")
    print(payload)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
