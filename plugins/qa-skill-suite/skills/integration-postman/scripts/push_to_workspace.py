#!/usr/bin/env python3
"""Push a local Postman collection to a Postman workspace via the Postman REST API.

After running this script, the collection appears immediately in the Postman app
(desktop or web) so the user can open it and run it manually, add variables,
or trigger a Monitor.

Authentication uses a Postman API key supplied through the environment variable
``POSTMAN_API_KEY`` (never as a CLI argument). Generate a free API key at:
https://web.postman.co/settings/me/api-keys

Usage::

    # First time: create a new collection in a workspace
    POSTMAN_API_KEY=PMAK-... python3 scripts/push_to_workspace.py \\
        collection.json \\
        --workspace <workspace-id> \\
        --dry-run

    # Apply (without --dry-run)
    POSTMAN_API_KEY=PMAK-... python3 scripts/push_to_workspace.py \\
        collection.json \\
        --workspace <workspace-id> \\
        --apply

    # Update an existing collection in Postman (overwrite by ID)
    POSTMAN_API_KEY=PMAK-... python3 scripts/push_to_workspace.py \\
        collection.json \\
        --workspace <workspace-id> \\
        --collection-id <existing-postman-collection-id> \\
        --apply

    # List workspaces (read-only smoke test)
    POSTMAN_API_KEY=PMAK-... python3 scripts/push_to_workspace.py list-workspaces

Outputs on success::

    PASS collection_id=<id> collection_name=<name> workspace=<id>
    URL https://web.postman.co/workspace/<workspace-id>/collection/<id>
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


POSTMAN_API_BASE = "https://api.getpostman.com"
POSTMAN_WEB_BASE = "https://web.postman.co"


# ---------------------------------------------------------------------------
# HTTP helpers (stdlib only — no requests dependency)
# ---------------------------------------------------------------------------

def _api_key() -> str:
    key = os.environ.get("POSTMAN_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "POSTMAN_API_KEY environment variable is not set. "
            "Generate a free key at https://web.postman.co/settings/me/api-keys"
        )
    if not key.startswith("PMAK-"):
        raise RuntimeError(
            "POSTMAN_API_KEY does not look like a valid Postman API key "
            "(expected prefix PMAK-). Check the value and try again."
        )
    return key


def _headers(key: str) -> dict[str, str]:
    return {
        "X-Api-Key": key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _get(url: str, key: str) -> Any:
    req = Request(url, headers=_headers(key), method="GET")
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"HTTP {exc.code} GET {url}: {body[:300]}"
        ) from exc
    except URLError as exc:
        raise RuntimeError(f"Network error GET {url}: {exc.reason}") from exc


def _post(url: str, key: str, payload: dict) -> Any:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(url, data=body, headers=_headers(key), method="POST")
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"HTTP {exc.code} POST {url}: {body_text[:300]}"
        ) from exc
    except URLError as exc:
        raise RuntimeError(f"Network error POST {url}: {exc.reason}") from exc


def _put(url: str, key: str, payload: dict) -> Any:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(url, data=body, headers=_headers(key), method="PUT")
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"HTTP {exc.code} PUT {url}: {body_text[:300]}"
        ) from exc
    except URLError as exc:
        raise RuntimeError(f"Network error PUT {url}: {exc.reason}") from exc


# ---------------------------------------------------------------------------
# Postman API operations
# ---------------------------------------------------------------------------

def list_workspaces(key: str) -> list[dict]:
    """Return workspace objects for the authenticated account."""
    resp = _get(f"{POSTMAN_API_BASE}/workspaces", key)
    workspaces = resp.get("workspaces") or []
    return workspaces


def get_workspace(workspace_id: str, key: str) -> dict:
    """Read-back a single workspace to confirm ID and access."""
    resp = _get(f"{POSTMAN_API_BASE}/workspaces/{workspace_id}", key)
    return resp.get("workspace") or {}


def get_collection(collection_id: str, key: str) -> dict:
    """Read back a collection by ID to verify it exists."""
    resp = _get(f"{POSTMAN_API_BASE}/collections/{collection_id}", key)
    return resp.get("collection") or {}


def create_collection(
    workspace_id: str, collection: dict, key: str
) -> dict:
    """Create a new collection in the specified workspace. Returns API response."""
    payload = {"collection": collection}
    if workspace_id:
        url = f"{POSTMAN_API_BASE}/collections?workspace={workspace_id}"
    else:
        url = f"{POSTMAN_API_BASE}/collections"
    return _post(url, key, payload)


def update_collection(
    collection_id: str, collection: dict, key: str
) -> dict:
    """Replace an existing collection in Postman by ID. Returns API response."""
    payload = {"collection": collection}
    url = f"{POSTMAN_API_BASE}/collections/{collection_id}"
    return _put(url, key, payload)


# ---------------------------------------------------------------------------
# Load and validate collection
# ---------------------------------------------------------------------------

def load_collection(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Cannot read collection: {exc}") from exc
    if not isinstance(value, dict):
        raise RuntimeError("Collection root must be a JSON object")
    info = value.get("info") or {}
    if not isinstance(info, dict) or not info.get("schema"):
        raise RuntimeError(
            "File does not look like a Postman v2/v2.1 collection "
            "(missing info.schema)"
        )
    return value


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_list_workspaces(args: argparse.Namespace) -> int:
    try:
        key = _api_key()
        workspaces = list_workspaces(key)
    except RuntimeError as exc:
        print(f"BLOCKED {exc}", file=sys.stderr)
        return 1
    if not workspaces:
        print("NOTICE no_workspaces_found check_account_permissions")
        return 0
    print(f"PASS workspaces_found={len(workspaces)}")
    for ws in workspaces:
        ws_id = ws.get("id", "?")
        ws_name = ws.get("name", "?")
        ws_type = ws.get("type", "?")
        print(f"  workspace id={ws_id} name={ws_name!r} type={ws_type}")
    return 0


def cmd_push(args: argparse.Namespace) -> int:
    # Load and validate the local collection
    try:
        collection = load_collection(Path(args.collection))
    except RuntimeError as exc:
        print(f"BLOCKED load_error {exc}", file=sys.stderr)
        return 2

    col_name = collection.get("info", {}).get("name", Path(args.collection).stem)

    if not args.workspace:
        print(
            "BLOCKED exact_target_required supply=--workspace <workspace-id>",
            file=sys.stderr,
        )
        return 2

    # Announce mutation contract
    operation = "update" if args.collection_id else "create"
    print(f"Target: Postman workspace={args.workspace}")
    print(f"Operation: {operation} collection name={col_name!r}")
    print("Required input: POSTMAN_API_KEY environment variable")
    print(f"Write action: {'PUT /collections/' + args.collection_id if args.collection_id else 'POST /collections'}")
    print("Verification: read-back collection ID, name, and workspace")

    if args.dry_run:
        items = collection.get("item") or []
        item_count = sum(
            len(f.get("item") or []) if "item" in f else 1 for f in items
        )
        print(
            f"DRY_RUN collection={col_name!r} "
            f"folders={len(items)} requests_approx={item_count}"
        )
        return 0

    if not getattr(args, "apply", False):
        print(
            "BLOCKED write_confirmation_required rerun_with=--apply",
            file=sys.stderr,
        )
        return 2

    try:
        key = _api_key()
    except RuntimeError as exc:
        print(f"BLOCKED auth_required {exc}", file=sys.stderr)
        return 1

    # Verify workspace access (read-only first)
    try:
        ws = get_workspace(args.workspace, key)
        if ws.get("id") != args.workspace:
            raise RuntimeError("workspace_not_found, mismatched_id, or permission_denied")
        print(
            f"PASS workspace_verified id={ws['id']} name={ws.get('name')!r}"
        )
    except RuntimeError as exc:
        print(f"BLOCKED workspace_verification_failed {exc}", file=sys.stderr)
        return 1

    # Push
    try:
        if args.collection_id:
            resp = update_collection(args.collection_id, collection, key)
            result_col = resp.get("collection") or {}
            col_id = result_col.get("id") or args.collection_id
        else:
            resp = create_collection(args.workspace, collection, key)
            result_col = resp.get("collection") or {}
            col_id = result_col.get("id") or result_col.get("uid", "")
    except RuntimeError as exc:
        print(f"FAILED push_error {exc}", file=sys.stderr)
        return 1

    if not col_id:
        print(
            f"FAILED unexpected_response keys={list(resp.keys())}",
            file=sys.stderr,
        )
        return 1

    # Read back to verify
    try:
        read_back = get_collection(col_id, key)
        rb_name = (read_back.get("info") or {}).get("name", "?")
        rb_id = read_back.get("id") or read_back.get("uid")
        if rb_id and rb_id != col_id and not str(rb_id).endswith(f"-{col_id}"):
            raise RuntimeError(
                f"collection_id_mismatch expected={col_id!r} got={rb_id!r}"
            )
        if rb_name != col_name:
            raise RuntimeError(
                f"collection_name_mismatch expected={col_name!r} got={rb_name!r}"
            )
    except RuntimeError as exc:
        print(f"FAILED read_back_verification {exc}", file=sys.stderr)
        return 1

    ws_id = args.workspace
    web_url = f"{POSTMAN_WEB_BASE}/workspace/{ws_id}/collection/{col_id}"
    print(
        f"PASS collection_id={col_id} collection_name={rb_name!r} workspace={ws_id}"
    )
    print(f"URL {web_url}")
    print("NEXT open Postman app or visit the URL above to run the collection")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    # list-workspaces
    lw = subparsers.add_parser(
        "list-workspaces",
        help="List accessible Postman workspaces (read-only smoke test)",
    )
    lw.set_defaults(handler=cmd_list_workspaces)

    # push
    push = subparsers.add_parser(
        "push",
        help="Upload a local collection to a Postman workspace",
    )
    push.add_argument("collection", help="Path to the local Postman v2/v2.1 collection JSON")
    push.add_argument(
        "--workspace",
        required=True,
        help="Exact Postman workspace ID",
    )
    push.add_argument(
        "--collection-id",
        dest="collection_id",
        default="",
        help="Existing Postman collection ID to update (omit to create new)",
    )
    execution = push.add_mutually_exclusive_group()
    execution.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate locally without making API calls",
    )
    execution.add_argument(
        "--apply",
        action="store_true",
        help="Confirm the authorized workspace write after dry-run review",
    )
    push.set_defaults(handler=cmd_push)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
