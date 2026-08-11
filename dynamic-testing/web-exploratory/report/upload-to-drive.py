#!/usr/bin/env python3
"""Upload a file to a Google Drive folder as the *user* (not the service account).

Why not the service account: the team SA (`sheet-editor@…`, on a personal-Gmail
GCP project) has **no Drive storage quota**, so SA uploads to a My Drive folder
fail with "Service Accounts do not have storage quota". And `gcloud auth
application-default login` is blocked from requesting the Drive scope on its
default client ID. The working path is a **project-owned OAuth client (Desktop)**
+ a one-time browser consent, then upload with the user's own 15GB quota.

One-time setup (see SKILL.md):
  1. GCP Console → Google Auth Platform (project cloud-functions-356320):
     OAuth client ID → Application type "Desktop app" → download the JSON.
     Save it to ~/.config/drive-oauth-client.json (chmod 600).
  2. Audience → Test users → add your Gmail (app stays in "Testing" mode;
     test users may consent to the restricted Drive scope without verification).

Usage:
  python3 upload-to-drive.py <file> <folder_id> [--name NAME]
First run opens a browser for consent (Advanced → Continue → tick Drive); the
token is cached at ~/.config/drive-uploader-token.json so later runs are silent.

Env overrides: DRIVE_OAUTH_CLIENT, DRIVE_OAUTH_TOKEN, DRIVE_OAUTH_PORT.
"""
import argparse
import os
import sys

from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
CLIENT = os.environ.get("DRIVE_OAUTH_CLIENT",
                        os.path.expanduser("~/.config/drive-oauth-client.json"))
TOKEN = os.environ.get("DRIVE_OAUTH_TOKEN",
                       os.path.expanduser("~/.config/drive-uploader-token.json"))
PORT = int(os.environ.get("DRIVE_OAUTH_PORT", "8765"))


def get_creds() -> Credentials:
    creds = None
    if os.path.exists(TOKEN):
        creds = Credentials.from_authorized_user_file(TOKEN, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CLIENT):
                sys.exit(f"Missing OAuth client at {CLIENT}. See SKILL.md one-time setup.")
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT, SCOPES)
            creds = flow.run_local_server(
                port=PORT, open_browser=True,
                authorization_prompt_message="Open this URL if the browser didn't:\n{url}\n",
                success_message="Authenticated — back to the terminal.")
        os.makedirs(os.path.dirname(TOKEN), exist_ok=True)
        with open(TOKEN, "w") as fh:
            fh.write(creds.to_json())
        os.chmod(TOKEN, 0o600)
    return creds


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("file", help="local file to upload")
    ap.add_argument("folder_id", help="Drive folder ID (from the folder URL)")
    ap.add_argument("--name", default=None, help="name in Drive (default: basename)")
    ap.add_argument("--mime", default="application/pdf", help="MIME type")
    args = ap.parse_args()

    if not os.path.isfile(args.file):
        sys.exit(f"File not found: {args.file}")

    drive = build("drive", "v3", credentials=get_creds())
    who = drive.about().get(fields="user(emailAddress)").execute()
    print("upload as:", who["user"]["emailAddress"])

    media = MediaFileUpload(args.file, mimetype=args.mime, resumable=True)
    meta = {"name": args.name or os.path.basename(args.file), "parents": [args.folder_id]}
    f = drive.files().create(body=meta, media_body=media,
                             fields="id,name,webViewLink",
                             supportsAllDrives=True).execute()
    print("UPLOAD OK")
    print("  name:", f["name"])
    print("  link:", f["webViewLink"])


if __name__ == "__main__":
    main()
