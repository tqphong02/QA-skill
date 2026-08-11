#!/usr/bin/env python3
"""Read file or folder contents directly from Google Drive without local file download."""

import argparse
import sys
from drive_common import extract_id_from_target, get_drive_service


def read_target(target, format_type="text", max_items=50, reauth=False):
    service = get_drive_service(force_reauth=reauth)
    file_id = extract_id_from_target(target)

    if not file_id:
        raise SystemExit("Error: Could not parse File/Folder ID from target.")

    # Get Metadata
    try:
        meta = (
            service.files()
            .get(
                fileId=file_id,
                fields="id,name,mimeType,size,modifiedTime,parents,webViewLink",
                supportsAllDrives=True,
            )
            .execute()
        )
    except Exception as exc:
        raise SystemExit(f"Error fetching metadata for ID '{file_id}': {exc}")

    mime = meta.get("mimeType", "")
    print(f"Target Name: {meta['name']}")
    print(f"Target ID:   {meta['id']}")
    print(f"MIME Type:   {mime}")
    print(f"View Link:   {meta.get('webViewLink', '')}")
    print("=" * 60)

    # 1. Folder listing
    if mime == "application/vnd.google-apps.folder":
        query = f"'{file_id}' in parents and trashed = false"
        res = (
            service.files()
            .list(
                q=query,
                pageSize=max_items,
                fields="files(id,name,mimeType,size,modifiedTime)",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        items = res.get("files", [])
        print(f"Folder Contents ({len(items)} items):")
        for item in items:
            item_mime = item.get("mimeType", "")
            is_folder = item_mime == "application/vnd.google-apps.folder"
            type_str = "[FOLDER]" if is_folder else "[FILE]  "
            print(f" - {type_str} {item['name']} (ID: {item['id']}, Type: {item_mime})")
        return items

    # 2. Google Workspace Native Docs
    if mime == "application/vnd.google-apps.document":
        content = service.files().export(fileId=file_id, mimeType="text/plain").execute()
        text = content.decode("utf-8")
        print(text)
        return text

    # 3. Google Workspace Native Sheets
    if mime == "application/vnd.google-apps.spreadsheet":
        export_mime = "text/csv" if format_type == "csv" else "text/csv"
        content = service.files().export(fileId=file_id, mimeType=export_mime).execute()
        text = content.decode("utf-8")
        print(text)
        return text

    # 4. Binary formats on Drive (Word .docx, Excel .xlsx, PDF, CSV, Plain text)
    # Check if exportable (e.g. converted or Google preview export)
    try:
        if "word" in mime or mime.endswith("document") or mime.endswith("docx"):
            # Try exporting Word doc
            content = service.files().export(fileId=file_id, mimeType="text/plain").execute()
            text = content.decode("utf-8")
            print(text)
            return text
        elif "sheet" in mime or "excel" in mime or mime.endswith("xlsx"):
            content = service.files().export(fileId=file_id, mimeType="text/csv").execute()
            text = content.decode("utf-8")
            print(text)
            return text
    except Exception:
        pass

    # Standard file download into RAM (media get)
    try:
        content = service.files().get_media(fileId=file_id).execute()
        try:
            text = content.decode("utf-8")
            print(text)
            return text
        except UnicodeDecodeError:
            print(f"Binary file ({meta.get('size', 0)} bytes). Cannot output raw binary as text.")
            return content
    except Exception as exc:
        raise SystemExit(f"Error reading content of file: {exc}")


def main():
    parser = argparse.ArgumentParser(
        description="Read/export content of any file or folder on Google Drive"
    )
    parser.add_argument("target", help="File/Folder ID or Google Drive/Docs URL")
    parser.add_argument(
        "--format", choices=["text", "csv", "json"], default="text", help="Output format"
    )
    parser.add_argument("--max-items", type=int, default=50, help="Max items for folder listing")
    parser.add_argument("--reauth", action="store_true", help="Force re-authentication")

    args = parser.parse_args()
    read_target(
        args.target,
        format_type=args.format,
        max_items=args.max_items,
        reauth=args.reauth,
    )


if __name__ == "__main__":
    main()
