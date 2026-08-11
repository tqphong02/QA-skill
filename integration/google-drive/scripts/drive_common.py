#!/usr/bin/env python3
"""Common utilities for Google Drive CLI scripts.

OAuth resolution order:
  1. DRIVE_OAUTH_CLIENT env var (explicit override)
  2. ~/.config/drive-oauth-client.json (legacy path for Python script)
  3. ~/.config/google-drive-mcp/gcp-oauth.keys.json (shared MCP credential)

Token resolution order:
  1. DRIVE_OAUTH_TOKEN env var (explicit override)
  2. ~/.config/drive-uploader-token.json (Python-compatible token cache)
  3. Auto-generated from MCP tokens.json if present (converted once, cached)
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/presentations",
]

_CONFIG_DIR = os.path.expanduser("~/.config")
_MCP_DIR = os.path.join(_CONFIG_DIR, "google-drive-mcp")

CLIENT_CANDIDATES = [
    os.environ.get("DRIVE_OAUTH_CLIENT", ""),
    os.path.join(_CONFIG_DIR, "drive-oauth-client.json"),
    os.path.join(_MCP_DIR, "gcp-oauth.keys.json"),
]

# Python SDK-compatible token cache (separate from MCP tokens.json format)
PYTHON_TOKEN_PATH = os.environ.get(
    "DRIVE_OAUTH_TOKEN",
    os.path.join(_CONFIG_DIR, "drive-sdk-token.json"),
)
# MCP token file (different format — accounts/default structure)
MCP_TOKEN_PATH = os.path.join(_MCP_DIR, "tokens.json")

PORT = int(os.environ.get("DRIVE_OAUTH_PORT", "8765"))


# ─── Utilities ────────────────────────────────────────────────────────────────

def resolve_existing_path(candidates):
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return None


def save_token(creds, token_path=PYTHON_TOKEN_PATH):
    token_dir = os.path.dirname(token_path)
    if token_dir:
        os.makedirs(token_dir, exist_ok=True)
    with open(token_path, "w", encoding="utf-8") as f:
        f.write(creds.to_json())
    os.chmod(token_path, 0o600)


def extract_id_from_target(target):
    """Extract Drive File or Folder ID from a URL or raw ID string."""
    target = (target or "").strip()
    if not target:
        return ""
    # Already an ID (alphanumeric + dash/underscore, 15+ chars)
    if re.match(r"^[a-zA-Z0-9_-]{15,}$", target):
        return target
    # Parse known Drive URL patterns
    for pattern in (r"/d/([a-zA-Z0-9_-]+)", r"/folders/([a-zA-Z0-9_-]+)", r"[?&]id=([a-zA-Z0-9_-]+)"):
        m = re.search(pattern, target)
        if m:
            return m.group(1)
    return target


# ─── MCP → Python SDK token bridge ────────────────────────────────────────────

def _try_build_creds_from_mcp_token(client_path):
    """
    Attempt to build a google.oauth2.credentials.Credentials object using
    the refreshToken stored in the MCP tokens.json.  Returns None if the file
    is absent, malformed, or the necessary libraries are missing.
    """
    if not os.path.isfile(MCP_TOKEN_PATH):
        return None
    try:
        mcp = json.load(open(MCP_TOKEN_PATH, encoding="utf-8"))
        account = (mcp.get("accounts") or {}).get("default") or {}
        refresh_token = account.get("refreshToken")
        if not refresh_token:
            return None

        gcp = json.load(open(client_path, encoding="utf-8"))
        inner = gcp.get("installed") or gcp.get("web") or {}
        client_id = inner.get("client_id", "")
        client_secret = inner.get("client_secret", "")
        token_uri = inner.get("token_uri", "https://oauth2.googleapis.com/token")
        if not (client_id and client_secret):
            return None

        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request

        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri=token_uri,
            client_id=client_id,
            client_secret=client_secret,
            scopes=SCOPES,
        )
        creds.refresh(Request())
        return creds
    except Exception as exc:
        print(f"[drive_common] MCP token bridge failed: {exc}", file=sys.stderr)
        return None


# ─── Main auth entry point ────────────────────────────────────────────────────

def get_drive_service(force_reauth=False):
    """Return an authenticated Google Drive API v3 service resource."""
    try:
        from google.auth.exceptions import RefreshError
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise SystemExit(
            "Missing Google Drive Python dependencies. Install with:\n"
            "  pip3 install google-auth google-auth-oauthlib google-api-python-client"
        ) from exc

    client_path = resolve_existing_path(CLIENT_CANDIDATES)
    if not client_path:
        raise SystemExit(
            "Missing OAuth client JSON. Looked in:\n"
            + "\n".join(f"  - {p}" for p in CLIENT_CANDIDATES if p)
            + "\nSee references/GOOGLE_CLOUD_OAUTH_SETUP.md for instructions."
        )

    creds = None

    # 1. Try Python SDK-compatible cached token
    if not force_reauth and os.path.isfile(PYTHON_TOKEN_PATH):
        try:
            creds = Credentials.from_authorized_user_file(PYTHON_TOKEN_PATH, SCOPES)
        except Exception:
            creds = None

    # 2. Refresh if expired
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            save_token(creds)
        except RefreshError:
            print("[drive_common] Python token refresh failed; trying MCP bridge.", file=sys.stderr)
            creds = None

    if creds and creds.valid:
        return build("drive", "v3", credentials=creds)

    # 3. Try building creds from MCP refresh token (bridged automatically)
    if not force_reauth:
        creds = _try_build_creds_from_mcp_token(client_path)
        if creds and creds.valid:
            save_token(creds)
            print("[drive_common] OAuth token built from MCP credential and cached.", file=sys.stderr)
            return build("drive", "v3", credentials=creds)

    # 4. Full browser OAuth consent (first run or --reauth)
    print("[drive_common] Opening browser for Google OAuth consent...", file=sys.stderr)
    flow = InstalledAppFlow.from_client_secrets_file(client_path, SCOPES)
    creds = flow.run_local_server(
        port=PORT,
        open_browser=True,
        authorization_prompt_message="Open this URL if the browser did not open:\n{url}\n",
        success_message="Google Drive authenticated. You may close this browser tab.",
    )
    save_token(creds)
    return build("drive", "v3", credentials=creds)
