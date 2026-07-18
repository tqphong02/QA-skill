# Drive capability routing

## Preferred route: configured Google Drive MCP

Use the configured `google-drive` MCP for Drive file/folder CRUD, Google Docs, Sheets, Slides, and permissions. Resolve a supplied link to its file or folder ID and query that exact object first. If the user supplies only a name, search Drive by name and present ambiguous matches before reading or mutating.

If no Drive tools are available in the current session, stop and report that the MCP is not loaded. A newly configured MCP may require a Codex restart or a new thread. Do not use web search, local filename search, or model memory as a substitute for private Drive content.

## Upload a local artifact

Use `scripts/drive_upload.py` when all of these are true:

- the source is a real local file;
- the destination folder ID is known;
- the user authorized the upload;
- a Desktop OAuth client exists locally.

The local script uses the user's Drive quota and the `drive.file` scope. It is an upload fallback, not the preferred general CRUD route.

## Google Sheets or Docs editing

Use the MCP tool specialized for the requested native Google file type. Do not download, rewrite, and re-upload a Sheet, Doc, or Slides file unless the user explicitly requests replacement; doing so can lose comments, formulas, permissions, or version history.
