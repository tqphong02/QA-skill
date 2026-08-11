#!/usr/bin/env python3
"""Update file metadata, move files, or overwrite content on Google Drive."""

import argparse
import os
import sys
from drive_common import extract_id_from_target, get_drive_service


def update_target(
    target,
    name=None,
    move_to=None,
    content=None,
    file_path=None,
    reauth=False,
):
    service = get_drive_service(force_reauth=reauth)
    file_id = extract_id_from_target(target)

    if not file_id:
        raise SystemExit("Error: Could not parse File/Folder ID from target.")

    # Fetch existing metadata
    try:
        meta = (
            service.files()
            .get(fileId=file_id, fields="id,name,mimeType,parents", supportsAllDrives=True)
            .execute()
        )
    except Exception as exc:
        raise SystemExit(f"Error fetching metadata for ID '{file_id}': {exc}")

    body = {}
    if name:
        body["name"] = name

    # Move logic
    add_parents = None
    remove_parents = None
    if move_to:
        new_parent_id = extract_id_from_target(move_to)
        old_parents = meta.get("parents", [])
        add_parents = new_parent_id
        remove_parents = ",".join(old_parents)

    media_body = None
    if file_path:
        source = os.path.abspath(file_path)
        if not os.path.isfile(source):
            raise SystemExit(f"Local file not found: {source}")
        from googleapiclient.http import MediaFileUpload

        media_body = MediaFileUpload(source, resumable=True)
    elif content is not None:
        from io import BytesIO
        from googleapiclient.http import MediaIoBaseUpload

        text_data = content.encode("utf-8")
        media_body = MediaIoBaseUpload(BytesIO(text_data), mimetype="text/plain", resumable=True)

    kwargs = {
        "fileId": file_id,
        "body": body,
        "fields": "id,name,mimeType,parents,webViewLink",
        "supportsAllDrives": True,
    }
    if add_parents:
        kwargs["addParents"] = add_parents
    if remove_parents:
        kwargs["removeParents"] = remove_parents
    if media_body:
        kwargs["media_body"] = media_body

    res = service.files().update(**kwargs).execute()
    print("UPDATE OK")
    print(f"Name: {res['name']}")
    print(f"ID:   {res['id']}")
    print(f"Link: {res.get('webViewLink', '')}")
    return res


def main():
    parser = argparse.ArgumentParser(description="Update metadata, move, or edit content of a file on Drive")
    parser.add_argument("target", help="File/Folder ID or Google Drive/Docs URL")
    parser.add_argument("--name", help="New name for the file or folder")
    parser.add_argument("--move-to", help="Target parent folder ID or URL to move into")
    parser.add_argument("--content", help="New text content to update file")
    parser.add_argument("--file", help="Local file path to overwrite content")
    parser.add_argument("--reauth", action="store_true", help="Force re-authentication")

    args = parser.parse_args()
    if not (args.name or args.move_to or args.content is not None or args.file):
        parser.error("At least one action (--name, --move-to, --content, or --file) must be specified.")

    update_target(
        args.target,
        name=args.name,
        move_to=args.move_to,
        content=args.content,
        file_path=args.file,
        reauth=args.reauth,
    )


if __name__ == "__main__":
    main()
