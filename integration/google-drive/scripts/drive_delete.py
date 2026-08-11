#!/usr/bin/env python3
"""Trash or permanently delete a file or folder on Google Drive."""

import argparse
import sys
from drive_common import extract_id_from_target, get_drive_service


def delete_target(target, permanent=False, confirm=False, reauth=False):
    service = get_drive_service(force_reauth=reauth)
    file_id = extract_id_from_target(target)

    if not file_id:
        raise SystemExit("Error: Could not parse File/Folder ID from target.")

    try:
        meta = (
            service.files()
            .get(fileId=file_id, fields="id,name,mimeType", supportsAllDrives=True)
            .execute()
        )
    except Exception as exc:
        raise SystemExit(f"Error fetching metadata for ID '{file_id}': {exc}")

    name = meta.get("name", "Unknown")
    action_str = "PERMANENTLY DELETE" if permanent else "MOVE TO TRASH"

    if not confirm:
        print(f"Safety Prompt: Are you sure you want to {action_str} item '{name}' (ID: {file_id})?")
        answer = input("Type 'yes' to proceed: ")
        if answer.strip().lower() != "yes":
            print("Operation cancelled.")
            return False

    if permanent:
        service.files().delete(fileId=file_id, supportsAllDrives=True).execute()
        print(f"PERMANENTLY DELETED: {name} (ID: {file_id})")
    else:
        service.files().update(
            fileId=file_id, body={"trashed": True}, supportsAllDrives=True
        ).execute()
        print(f"MOVED TO TRASH: {name} (ID: {file_id})")
    return True


def main():
    parser = argparse.ArgumentParser(description="Trash or permanently delete an item on Google Drive")
    parser.add_argument("target", help="File/Folder ID or Google Drive/Docs URL")
    parser.add_argument(
        "--permanent", action="store_true", help="Permanently delete instead of trashing"
    )
    parser.add_argument(
        "--yes", action="store_true", help="Skip confirmation prompt"
    )
    parser.add_argument("--reauth", action="store_true", help="Force re-authentication")

    args = parser.parse_args()
    delete_target(
        args.target,
        permanent=args.permanent,
        confirm=args.yes,
        reauth=args.reauth,
    )


if __name__ == "__main__":
    main()
