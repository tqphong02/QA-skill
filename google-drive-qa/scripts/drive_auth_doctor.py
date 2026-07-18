#!/usr/bin/env python3
"""Inspect and optionally refresh the local Google Drive uploader credential."""

import argparse
import json
import os
import sys
from datetime import datetime, timezone


CLIENT = os.environ.get(
    "DRIVE_OAUTH_CLIENT", os.path.expanduser("~/.config/drive-oauth-client.json")
)
TOKEN = os.environ.get(
    "DRIVE_OAUTH_TOKEN", os.path.expanduser("~/.config/drive-uploader-token.json")
)
SCOPES = ["https://www.googleapis.com/auth/drive.file"]


def token_summary(path):
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    return {
        "has_refresh_token": bool(data.get("refresh_token")),
        "expiry": data.get("expiry"),
        "scopes": data.get("scopes", []),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="refresh an expired access token")
    args = parser.parse_args()

    print(f"OAuth client: {'FOUND' if os.path.isfile(CLIENT) else 'MISSING'} ({CLIENT})")
    print(f"Token cache: {'FOUND' if os.path.isfile(TOKEN) else 'MISSING'} ({TOKEN})")
    if not os.path.isfile(CLIENT):
        print("DRIVE AUTH NOT READY: create a Desktop OAuth client before local uploads.")
        return 2
    if not os.path.isfile(TOKEN):
        print("DRIVE AUTH READY FOR CONSENT: the first upload will open browser authorization.")
        return 0

    try:
        summary = token_summary(TOKEN)
    except (OSError, ValueError) as exc:
        print(f"DRIVE TOKEN INVALID: cannot parse token cache ({exc}).")
        return 3
    print(f"Refresh token: {'PRESENT' if summary['has_refresh_token'] else 'MISSING'}")
    print(f"Expiry: {summary['expiry'] or 'UNKNOWN'}")
    print(f"Scopes: {', '.join(summary['scopes']) or 'UNKNOWN'}")

    if not args.refresh:
        print("Metadata check complete. Use --refresh to verify the credential with Google.")
        return 0

    try:
        from google.auth.exceptions import RefreshError
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
    except ImportError:
        print("DRIVE DEPENDENCY MISSING: install google-auth and google-api-python-client packages.")
        return 5

    try:
        creds = Credentials.from_authorized_user_file(TOKEN, SCOPES)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN, "w", encoding="utf-8") as handle:
                handle.write(creds.to_json())
            os.chmod(TOKEN, 0o600)
            print(f"DRIVE AUTH OK: token refreshed at {datetime.now(timezone.utc).isoformat()}.")
        elif creds.valid:
            print("DRIVE AUTH OK: cached token is valid.")
        else:
            print("DRIVE REAUTH REQUIRED: cached credential has no usable refresh token.")
            return 4
    except RefreshError as exc:
        print(f"DRIVE REAUTH REQUIRED: refresh was rejected ({exc}).")
        return 4
    return 0


if __name__ == "__main__":
    sys.exit(main())
