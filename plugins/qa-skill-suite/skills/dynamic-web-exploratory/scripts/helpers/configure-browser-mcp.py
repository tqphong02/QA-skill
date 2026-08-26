#!/usr/bin/env python3
"""Configure the primary same-session browser MCP for dynamic-web-exploratory."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Enable Playwright MCP for dynamic-web-exploratory browser observability",
    )
    parser.add_argument("--agent", required=True, choices=("antigravity",))
    parser.add_argument("--config", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def load_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"cannot read valid JSON from {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise RuntimeError(f"config root must be a JSON object: {path}")
    return data


def atomic_write(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
        delete=False,
    ) as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temp_path = Path(handle.name)
    os.replace(temp_path, path)


def main() -> int:
    args = parse_args()
    config_path = (
        args.config.expanduser().resolve()
        if args.config
        else (Path.home() / ".gemini/config/mcp_config.json").resolve()
    )
    output_dir = (
        args.output_dir.expanduser().resolve()
        if args.output_dir
        else (Path.home() / ".gemini/evidence/../../playwright").resolve()
    )

    if shutil.which("npx") is None:
        print("BLOCKED: npx is required to launch @playwright/mcp", file=sys.stderr)
        return 1

    desired = {
        "disabled": False,
        "type": "stdio",
        "command": "npx",
        "args": [
            "-y",
            "@playwright/mcp@latest",
            "--headless",
            "--caps",
            "vision",
            "--output-mode",
            "file",
            "--snapshot-mode",
            "none",
            "--image-responses",
            "omit",
            "--output-dir",
            str(output_dir),
        ],
    }

    try:
        config = load_config(config_path)
    except RuntimeError as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 1

    servers = config.get("mcpServers")
    if servers is None:
        servers = {}
        config["mcpServers"] = servers
    if not isinstance(servers, dict):
        print("BLOCKED: mcpServers must be a JSON object", file=sys.stderr)
        return 1

    changed = servers.get("playwright") != desired
    print(f"INFO: agent={args.agent}")
    print(f"INFO: config={config_path}")
    print(f"INFO: output_dir={output_dir}")
    print(f"INFO: changed={'yes' if changed else 'no'}")

    if args.dry_run:
        print("DRY-RUN: Playwright MCP would be enabled without changing the config")
        return 0

    backup_path: Path | None = None
    if changed and config_path.exists():
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_path = config_path.with_name(f"{config_path.name}.bak-{stamp}")
        shutil.copy2(config_path, backup_path)
        print(f"INFO: backup={backup_path}")

    if changed:
        servers["playwright"] = desired
        atomic_write(config_path, config)

    try:
        written = load_config(config_path)
    except RuntimeError as exc:
        print(f"BLOCKED: read-back failed: {exc}", file=sys.stderr)
        return 1
    if written.get("mcpServers", {}).get("playwright") != desired:
        print("BLOCKED: Playwright MCP read-back mismatch", file=sys.stderr)
        return 1

    print("PASS: Playwright MCP is enabled for dynamic-web-exploratory same-session browser observability")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
