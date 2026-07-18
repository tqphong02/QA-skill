# Google Drive CRUD map

Use the configured `google-drive` MCP. Prefer the native tool for the object type instead of downloading and re-uploading Google Workspace files.

## Drive files and folders

- Create: `createTextFile`, `createFolder`, `uploadFile`, `copyFile`.
- Read: `search`, `listFolder`, `readTextFile`, `downloadFile`, `listSharedDrives`.
- Update: `updateTextFile`, `renameItem`, `moveItem`.
- Delete: `deleteItem`.

## Google Docs

- Create: `createGoogleDoc` or `createDocFromHTML`.
- Read: `readGoogleDoc`, `getGoogleDocContent`, `getDocumentInfo`, `listGoogleDocs`.
- Update: `updateGoogleDoc` and the specialized insert, replace, format, table, image, and comment tools.
- Delete: use Drive `deleteItem` on the document file ID.

## Google Sheets

- Create: `createGoogleSheet`; add a tab with `addSheet`.
- Read: `getGoogleSheetContent`, `getSpreadsheetInfo`, `listSheets`, `listGoogleSheets`.
- Update: `updateGoogleSheet`, `appendSpreadsheetRows`, and the specialized range, formatting, chart, filter, validation, and metadata tools.
- Delete: use `deleteSheet` for a tab; use Drive `deleteItem` for the whole spreadsheet file.

## Google Slides

- Create: `createGoogleSlides`.
- Read: `getGoogleSlidesContent` and the specialized presentation inspection tools.
- Update: `updateGoogleSlides` and the specialized text, shape, image, layout, and reorder tools.
- Delete: use `deleteGoogleSlide` for one slide; use Drive `deleteItem` for the whole presentation file.

## Permissions and sharing

- Create: `addPermission` or `shareFile`.
- Read: `listPermissions`.
- Update: `updatePermission`.
- Delete: `removePermission`.

## Target resolution

1. Parse a supplied Drive URL and use its exact file or folder ID.
2. If only a name is supplied, search first and present ambiguous matches before any write.
3. For native Docs, Sheets, or Slides content, use its specialized tool; use Drive tools for rename, move, copy, permissions, or whole-file deletion.
4. After a write, read the affected object back and report its ID, name, location, and changed field or content.

## Confirmation and safety

- Read, list, search, and download are read-only and do not need confirmation.
- Perform an explicitly requested create or update after resolving the destination and target. Ask only when the target, replacement behavior, or scope is ambiguous.
- Confirm the exact target immediately before deletion, overwriting existing content, removing or reducing access, transferring ownership, or a bulk move/rename unless the user's current request already specifies that exact action and target.
- Never use real user data to test delete. For a CRUD health test, create a clearly named disposable fixture only after the user authorizes the mutation, verify create/read/update, then delete that same fixture.
- Never print or store OAuth client secrets, access tokens, refresh tokens, or cookies in Markdown, logs, or chat.
