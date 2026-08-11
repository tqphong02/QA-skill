#!/usr/bin/env python3
"""Create files or folders, or upload local files to Google Drive (with auto-convert option)."""

import argparse
import mimetypes
import os
import sys
from drive_common import extract_id_from_target, get_drive_service

MIME_CONVERT_MAP = {
    ".docx": "application/vnd.google-apps.document",
    ".doc": "application/vnd.google-apps.document",
    ".xlsx": "application/vnd.google-apps.spreadsheet",
    ".xls": "application/vnd.google-apps.spreadsheet",
    ".csv": "application/vnd.google-apps.spreadsheet",
    ".pptx": "application/vnd.google-apps.presentation",
    ".ppt": "application/vnd.google-apps.presentation",
}


def create_item(
    target_type="file",
    name=None,
    file_path=None,
    folder_id=None,
    convert=False,
    content=None,
    reauth=False,
):
    service = get_drive_service(force_reauth=reauth)

    parent_id = extract_id_from_target(folder_id) if folder_id else None
    parents = [parent_id] if parent_id else []

    if target_type == "folder":
        folder_name = name or "New Folder"
        metadata = {
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder",
        }
        if parents:
            metadata["parents"] = parents
        res = service.files().create(body=metadata, fields="id,name,webViewLink").execute()
        print("FOLDER CREATED")
        print(f"Name: {res['name']}")
        print(f"ID: {res['id']}")
        print(f"Link: {res['webViewLink']}")
        return res

    # Handling File creation or upload
    if file_path:
        source = os.path.abspath(file_path)
        if not os.path.isfile(source):
            raise SystemExit(f"Local file not found: {source}")

        item_name = name or os.path.basename(source)
        ext = os.path.splitext(source)[1].lower()

        original_mime = mimetypes.guess_type(source)[0] or "application/octet-stream"
        target_mime = original_mime

        if convert and ext in MIME_CONVERT_MAP:
            target_mime = MIME_CONVERT_MAP[ext]

        from googleapiclient.http import MediaFileUpload

        media = MediaFileUpload(source, mimetype=original_mime, resumable=True)
        metadata = {"name": item_name}
        if convert and ext in MIME_CONVERT_MAP:
            metadata["mimeType"] = target_mime
        if parents:
            metadata["parents"] = parents

        res = (
            service.files()
            .create(
                body=metadata,
                media_body=media,
                fields="id,name,mimeType,webViewLink",
                supportsAllDrives=True,
            )
            .execute()
        )
        print("FILE UPLOADED")
        print(f"Name: {res['name']}")
        print(f"ID: {res['id']}")
        print(f"Type: {res['mimeType']}")
        print(f"Link: {res['webViewLink']}")
        return res

    # Creating plain text / doc directly from text content
    item_name = name or "Untitled Document"
    target_mime = "text/plain"
    if convert:
        target_mime = "application/vnd.google-apps.document"

    metadata = {"name": item_name, "mimeType": target_mime}
    if parents:
        metadata["parents"] = parents

    from io import BytesIO
    from googleapiclient.http import MediaIoBaseUpload

    text_data = (content or "").encode("utf-8")
    media = MediaIoBaseUpload(BytesIO(text_data), mimetype="text/plain", resumable=True)

    res = (
        service.files()
        .create(
            body=metadata,
            media_body=media,
            fields="id,name,mimeType,webViewLink",
            supportsAllDrives=True,
        )
        .execute()
    )
    print("FILE CREATED")
    print(f"Name: {res['name']}")
    print(f"ID: {res['id']}")
    print(f"Type: {res['mimeType']}")
    print(f"Link: {res['webViewLink']}")
    return res


def main():
    parser = argparse.ArgumentParser(description="Create or Upload items to Google Drive")
    parser.add_argument("--type", choices=["folder", "file", "doc", "sheet"], default="file")
    parser.add_argument("--name", help="Name of the file or folder")
    parser.add_argument("--file", help="Local file path to upload")
    parser.add_argument("--folder-id", help="Parent folder ID or URL")
    parser.add_argument("--content", help="Text content for new text/doc file")
    parser.add_argument(
        "--convert",
        action="store_true",
        help="Auto-convert Word/Excel/PDF/CSV to Google Doc/Sheet on upload",
    )
    parser.add_argument("--reauth", action="store_true", help="Force re-authentication")

    args = parser.parse_args()
    if args.type == "doc" or args.type == "sheet":
        args.convert = True

    create_item(
        target_type=args.type,
        name=args.name,
        file_path=args.file,
        folder_id=args.folder_id,
        convert=args.convert,
        content=args.content,
        reauth=args.reauth,
    )


if __name__ == "__main__":
    main()
