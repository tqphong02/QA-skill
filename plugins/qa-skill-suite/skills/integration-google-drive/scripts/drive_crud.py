#!/usr/bin/env python3
"""Unified CLI for Google Drive CRUD (Create, Read, Update, Delete) operations."""

import sys
import subprocess
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def print_help():
    print("""Google Drive CRUD CLI Wrapper

Usage:
  python3 drive_crud.py <OPERATION> [arguments...]

Operations:
  C, create    Create a folder/doc/sheet or upload a file (with optional --convert)
  R, read      Read content or list folder (Docs, Sheets, Word, Excel, PDF, Text)
  U, update    Update file metadata (rename, move) or content
  D, delete    Trash or permanently delete a file or folder

Examples:
  python3 drive_crud.py R https://docs.google.com/document/d/1abc...
  python3 drive_crud.py C --file report.docx --convert --folder-id 1xyz...
  python3 drive_crud.py U 1abc... --name "New_Document_Title"
  python3 drive_crud.py D 1abc... --yes
""")


def main():
    if len(sys.argv) < 2:
        print_help()
        sys.exit(1)

    op = sys.argv[1].lower()
    args = sys.argv[2:]

    if op in ["c", "create"]:
        target_script = os.path.join(SCRIPT_DIR, "drive_create.py")
    elif op in ["r", "read"]:
        target_script = os.path.join(SCRIPT_DIR, "drive_read.py")
    elif op in ["u", "update"]:
        target_script = os.path.join(SCRIPT_DIR, "drive_update.py")
    elif op in ["d", "delete"]:
        target_script = os.path.join(SCRIPT_DIR, "drive_delete.py")
    else:
        print(f"Unknown operation: '{sys.argv[1]}'\n")
        print_help()
        sys.exit(1)

    cmd = [sys.executable, target_script] + args
    result = subprocess.run(cmd)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
