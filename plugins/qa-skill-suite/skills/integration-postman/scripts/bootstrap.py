#!/usr/bin/env python3
"""Idempotently configure the official Postman MCP server for an AI host."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime


ENDPOINTS = {
    ("us", "minimal"): "https://mcp.postman.com/minimal",
    ("us", "code"): "https://mcp.postman.com/code",
    ("us", "full"): "https://mcp.postman.com/mcp",
    ("eu", "minimal"): "https://mcp.eu.postman.com/minimal",
    ("eu", "code"): "https://mcp.eu.postman.com/code",
    ("eu", "full"): "https://mcp.eu.postman.com/mcp",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Configure Postman MCP without storing user credentials"
    )
    parser.add_argument(
        "--agent",
        choices=("antigravity", "codex"),
        required=True,
        help="Agent host whose MCP configuration will be updated",
    )
    parser.add_argument(
        "--mode",
        choices=("minimal", "code", "full"),
        default="minimal",
        help="Postman MCP tool set",
    )
    parser.add_argument(
        "--region",
        choices=("us", "eu"),
        default="us",
        help="Postman account region",
    )
    parser.add_argument(
        "--config",
        type=Path,
        help="Override the Antigravity global MCP config path",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check configuration without changing it",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the planned target and operation without changing it",
    )
    parser.add_argument(
        "--replace-endpoint",
        action="store_true",
        help="Replace an existing official Postman endpoint with the selected mode",
    )
    return parser.parse_args()


def endpoint_for(args: argparse.Namespace) -> str:
    return ENDPOINTS[(args.region, args.mode)]


def antigravity_config_path(args: argparse.Namespace) -> Path:
    if args.config:
        return args.config.expanduser()
    override = os.environ.get("ANTIGRAVITY_GLOBAL_MCP_CONFIG")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".gemini" / "config" / "mcp_config.json"


def load_json_config(path: Path) -> dict:
    if not path.exists():
        return {"mcpServers": {}}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid_json path={path} detail={exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"invalid_root path={path} expected=object")
    servers = value.setdefault("mcpServers", {})
    if not isinstance(servers, dict):
        raise ValueError(f"invalid_mcpServers path={path} expected=object")
    return value


def redacted_postman_entry(entry: dict) -> dict:
    result = dict(entry)
    if "headers" in result:
        result["headers"] = "<preserved and redacted>"
    return result


def write_json_atomic(path: Path, value: dict) -> Path | None:
    path.parent.mkdir(parents=True, exist_ok=True)
    backup = None
    existing_mode = None
    if path.exists():
        existing_mode = path.stat().st_mode & 0o777
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = path.with_name(f"{path.name}.backup-{stamp}")
        counter = 1
        while backup.exists():
            backup = path.with_name(f"{path.name}.backup-{stamp}-{counter}")
            counter += 1
        shutil.copy2(path, backup)

    handle = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
        delete=False,
    )
    temp_path = Path(handle.name)
    try:
        with handle:
            json.dump(value, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        os.chmod(temp_path, existing_mode if existing_mode is not None else 0o600)
        os.replace(temp_path, path)
    finally:
        if temp_path.exists():
            temp_path.unlink()
    return backup


def configure_antigravity(args: argparse.Namespace) -> int:
    path = antigravity_config_path(args)
    endpoint = endpoint_for(args)
    print(f"Target: {path}")
    print("Operation: merge mcpServers.postman")
    print("Required input: Postman OAuth login after restarting Antigravity")
    print("Write action: preserve other servers and back up an existing config")
    print("Verification: JSON read-back then read-only workspace listing")

    try:
        config = load_json_config(path)
    except (OSError, ValueError) as exc:
        print(f"BLOCKED {exc}", file=sys.stderr)
        return 1

    current = config["mcpServers"].get("postman")
    desired = dict(current) if isinstance(current, dict) else {}
    current_endpoint = desired.get("serverUrl")
    if (
        isinstance(current_endpoint, str)
        and current_endpoint in ENDPOINTS.values()
        and not args.replace_endpoint
    ):
        endpoint = current_endpoint
    desired["serverUrl"] = endpoint
    desired["disabled"] = False

    if args.check:
        if current == desired:
            print(
                f"PASS agent=antigravity config=configured endpoint={endpoint} "
                "auth=manual_verification_required"
            )
            return 0
        print(
            f"FAILED agent=antigravity config=mcp_not_configured endpoint={endpoint}"
        )
        return 1

    if current == desired:
        print(
            f"PASS agent=antigravity operation=unchanged "
            f"entry={json.dumps(redacted_postman_entry(desired), sort_keys=True)}"
        )
        return 0

    if args.dry_run:
        print(
            f"DRY_RUN agent=antigravity "
            f"entry={json.dumps(redacted_postman_entry(desired), sort_keys=True)}"
        )
        return 0

    config["mcpServers"]["postman"] = desired
    try:
        backup = write_json_atomic(path, config)
        read_back = load_json_config(path)["mcpServers"].get("postman")
    except (OSError, ValueError) as exc:
        print(f"FAILED write_or_read_back detail={exc}", file=sys.stderr)
        return 1
    if read_back != desired:
        print("FAILED read_back_mismatch server=postman", file=sys.stderr)
        return 1

    backup_text = str(backup) if backup else "none_new_file"
    print(
        f"PASS agent=antigravity operation=configured endpoint={endpoint} "
        f"backup={backup_text}"
    )
    print("NEXT restart Antigravity, run /mcp, and complete Postman OAuth")
    return 0


def run_codex(*command: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def configure_codex(args: argparse.Namespace) -> int:
    endpoint = endpoint_for(args)
    print("Target: Codex MCP entry postman")
    print("Operation: add the official Postman remote MCP endpoint")
    print("Required input: Postman OAuth login through codex mcp login postman")
    print("Write action: create the Postman MCP entry only when absent")
    print("Verification: codex mcp get postman then read-only workspace listing")

    if shutil.which("codex") is None:
        print("BLOCKED runtime_missing agent=codex", file=sys.stderr)
        return 1

    current = run_codex("codex", "mcp", "get", "postman")
    if current.returncode == 0:
        print(
            "PASS agent=codex config=configured "
            "auth=manual_verification_required"
        )
        return 0
    if args.check:
        print("FAILED agent=codex config=mcp_not_configured")
        return 1
    if args.dry_run:
        print(f"DRY_RUN codex mcp add postman --url {endpoint}")
        return 0

    help_result = run_codex("codex", "mcp", "add", "--help")
    url_flag = "--url"
    if "--url" not in help_result.stdout and "--remote-url" in help_result.stdout:
        url_flag = "--remote-url"
    added = subprocess.run(
        ["codex", "mcp", "add", "postman", url_flag, endpoint],
        check=False,
    )
    if added.returncode != 0:
        print("FAILED codex_mcp_add server=postman", file=sys.stderr)
        return added.returncode
    read_back = run_codex("codex", "mcp", "get", "postman")
    if read_back.returncode != 0:
        print("FAILED codex_mcp_read_back server=postman", file=sys.stderr)
        return 1
    print(f"PASS agent=codex operation=configured endpoint={endpoint}")
    print("NEXT run: codex mcp login postman")
    return 0


def main() -> int:
    args = parse_args()
    if args.region == "eu":
        print(
            "NOTICE region=eu auth=api_key_required "
            "store the key only in a protected environment or secret manager"
        )
    if args.agent == "antigravity":
        return configure_antigravity(args)
    return configure_codex(args)


if __name__ == "__main__":
    raise SystemExit(main())
