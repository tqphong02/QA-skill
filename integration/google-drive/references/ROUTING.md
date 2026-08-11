# Drive capability routing

## Preferred routes: Google Drive MCP & Python CLI CRUD

For Drive file/folder CRUD, Google Docs, Sheets, Slides, Word, Excel, and PDFs:
1. **Google Drive MCP**: Use when MCP tools are active in the session.
2. **Python CLI CRUD Suite**: Use when executing direct Cloud-native operations without downloading temporary files to local disk.
   - Entry point: `python3 scripts/drive_crud.py <C|R|U|D> [options]`
   - Read: `python3 scripts/drive_read.py <FILE_ID_OR_URL>`
   - Create: `python3 scripts/drive_create.py --file <path> --folder-id <id> [--convert]`
   - Update: `python3 scripts/drive_update.py <FILE_ID_OR_URL> [--name <new_name>] [--move-to <folder_id>]`
   - Delete: `python3 scripts/drive_delete.py <FILE_ID_OR_URL> [--permanent] [--yes]`

If no Drive access or credentials exist, run `python3 scripts/drive_auth_doctor.py` to diagnose local OAuth credentials. Do not use web search, local filename search, or model memory as a substitute for private Drive content.


## Upload a local artifact

Use `scripts/drive_upload.py` when all of these are true:

- the source is a real local file;
- the destination folder ID is known;
- the user authorized the upload;
- a Desktop OAuth client exists locally.

The local script uses the user's Drive quota and the `drive.file` scope. It is an upload fallback, not the preferred general CRUD route.

## Google Sheets or Docs editing

Use the MCP tool specialized for the requested native Google file type. Do not download, rewrite, and re-upload a Sheet, Doc, or Slides file unless the user explicitly requests replacement; doing so can lose comments, formulas, permissions, or version history.
