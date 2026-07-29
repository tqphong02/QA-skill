#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path
from tempfile import NamedTemporaryFile


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Configure Appium MCP for a supported agent without exposing secrets"
    )
    parser.add_argument("--agent", choices=("antigravity",), required=True)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--android-home", type=Path)
    parser.add_argument("--screenshots-dir", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def resolve_android_home(explicit: Path | None) -> Path:
    candidates: list[Path] = []
    if explicit:
        candidates.append(explicit)
    for key in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        value = os.environ.get(key)
        if value:
            candidates.append(Path(value))
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        candidates.append(Path(local_app_data) / "Android" / "Sdk")
    candidates.extend(
        (
            Path.home() / "Library" / "Android" / "sdk",
            Path.home() / "Android" / "Sdk",
        )
    )

    for candidate in candidates:
        resolved = candidate.expanduser().resolve()
        if resolved.is_dir():
            return resolved
    raise RuntimeError(
        "Android SDK not found; pass --android-home or configure ANDROID_HOME"
    )


def load_config(path: Path) -> dict:
    if not path.exists():
        return {"mcpServers": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Invalid JSON in {path}: {error}") from error
    if not isinstance(data, dict):
        raise RuntimeError(f"Top-level JSON object required in {path}")
    servers = data.setdefault("mcpServers", {})
    if not isinstance(servers, dict):
        raise RuntimeError(f"mcpServers must be an object in {path}")
    return data


def atomic_write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
        delete=False,
    ) as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
        temporary = Path(handle.name)
    os.replace(temporary, path)


def main() -> int:
    args = parse_args()
    if shutil.which("npx") is None:
        print("BLOCKED: npx is not available", file=sys.stderr)
        return 1

    config_path = (
        args.config.expanduser().resolve()
        if args.config
        else Path.home() / ".gemini" / "config" / "mcp_config.json"
    )
    android_home = resolve_android_home(args.android_home)
    screenshots_dir = (
        args.screenshots_dir.expanduser().resolve()
        if args.screenshots_dir
        else Path.home() / ".gemini" / "evidence" / "mobile-qa"
    )

    desired = {
        "disabled": False,
        "timeout": 100,
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "appium-mcp@latest"],
        "env": {
            "ANDROID_HOME": str(android_home),
            "SCREENSHOTS_DIR": str(screenshots_dir),
            "NO_UI": "true",
        },
    }

    data = load_config(config_path)
    current = data["mcpServers"].get("appium-mcp")
    changed = current != desired

    print(f"INFO agent={args.agent}")
    print(f"INFO config={config_path}")
    print(f"INFO android_home={android_home}")
    print(f"INFO screenshots_dir={screenshots_dir}")
    print(f"INFO changed={'true' if changed else 'false'}")

    if args.dry_run:
        print("DRY_RUN write=none")
        return 0

    backup_path: Path | None = None
    if changed:
        if config_path.exists():
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
            backup_path = config_path.with_name(f"{config_path.name}.bak-{timestamp}")
            shutil.copy2(config_path, backup_path)
        screenshots_dir.mkdir(parents=True, exist_ok=True)
        data["mcpServers"]["appium-mcp"] = desired
        atomic_write(config_path, data)

    verified = load_config(config_path)["mcpServers"].get("appium-mcp")
    if verified != desired:
        print("BLOCKED: Appium MCP read-back mismatch", file=sys.stderr)
        return 1

    if backup_path:
        print(f"BACKUP config={backup_path}")
    print("PASS mcp=appium-mcp enabled=true transport=stdio")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
