#!/usr/bin/env python3
"""Upload one local file to a Google Drive folder with user OAuth."""

import argparse
import mimetypes
import os
import sys
from datetime import datetime, timezone

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
CLIENT = os.environ.get(
    "DRIVE_OAUTH_CLIENT", os.path.expanduser("~/.config/drive-oauth-client.json")
)
TOKEN = os.environ.get(
    "DRIVE_OAUTH_TOKEN", os.path.expanduser("~/.config/drive-uploader-token.json")
)
PORT = int(os.environ.get("DRIVE_OAUTH_PORT", "8765"))


def preserve_stale_token():
    if not os.path.exists(TOKEN):
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = f"{TOKEN}.expired-{stamp}"
    os.replace(TOKEN, backup)
    return backup


def save_creds(creds):
    token_dir = os.path.dirname(TOKEN)
    if token_dir:
        os.makedirs(token_dir, exist_ok=True)
    with open(TOKEN, "w", encoding="utf-8") as handle:
        handle.write(creds.to_json())
    os.chmod(TOKEN, 0o600)


def get_creds(force_reauth=False):
    try:
        from google.auth.exceptions import RefreshError
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError as exc:
        raise SystemExit(
            "Missing Google Drive Python dependencies. Install google-auth, "
            "google-auth-oauthlib, and google-api-python-client."
        ) from exc

    if force_reauth:
        backup = preserve_stale_token()
        if backup:
            print(f"Preserved stale token: {backup}")

    creds = None
    if os.path.exists(TOKEN):
        creds = Credentials.from_authorized_user_file(TOKEN, SCOPES)
    if creds and creds.valid:
        return creds
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            save_creds(creds)
            return creds
        except RefreshError as exc:
            raise SystemExit(
                f"Drive refresh rejected: {exc}. Rerun with --reauth to start browser consent."
            ) from exc
    if not os.path.exists(CLIENT):
        raise SystemExit(f"Missing OAuth client: {CLIENT}. See references/AUTH.md.")
    flow = InstalledAppFlow.from_client_secrets_file(CLIENT, SCOPES)
    creds = flow.run_local_server(
        port=PORT,
        open_browser=True,
        authorization_prompt_message="Open this URL if the browser did not open:\n{url}\n",
        success_message="Google Drive authenticated. Return to the terminal.",
    )
    save_creds(creds)
    return creds


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file")
    parser.add_argument("folder_id")
    parser.add_argument("--name")
    parser.add_argument("--mime")
    parser.add_argument("--reauth", action="store_true")
    args = parser.parse_args()

    source = os.path.abspath(args.file)
    if not os.path.isfile(source):
        raise SystemExit(f"File not found: {source}")
    if not args.folder_id.strip():
        raise SystemExit("Drive folder ID is required.")

    mime = args.mime or mimetypes.guess_type(source)[0] or "application/octet-stream"
    try:
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
    except ImportError as exc:
        raise SystemExit(
            "Missing Google Drive Python dependencies. Install google-api-python-client."
        ) from exc
    drive = build("drive", "v3", credentials=get_creds(args.reauth))
    who = drive.about().get(fields="user(emailAddress)").execute()
    print(f"Upload as: {who['user']['emailAddress']}")
    media = MediaFileUpload(source, mimetype=mime, resumable=True)
    metadata = {"name": args.name or os.path.basename(source), "parents": [args.folder_id]}
    uploaded = drive.files().create(
        body=metadata,
        media_body=media,
        fields="id,name,webViewLink",
        supportsAllDrives=True,
    ).execute()
    print("UPLOAD OK")
    print(f"Name: {uploaded['name']}")
    print(f"ID: {uploaded['id']}")
    print(f"Link: {uploaded['webViewLink']}")


if __name__ == "__main__":
    main()
