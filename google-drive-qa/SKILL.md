---
name: google-drive-qa
description: Perform full CRUD on Google Drive files and folders, Google Docs, Sheets, Slides, permissions, QA evidence, and reports. Use when the user mentions Google Drive, a drive.google.com link, a Drive folder or file ID, wants to create, read, search, update, rename, move, copy, upload, download, share, or delete Drive content, or when a previous Drive action failed because OAuth or MCP access expired. Check the MCP and authentication route before searching elsewhere.
---

# Google Drive QA

Use this skill as the stable workflow layer. A skill does not itself grant Drive access: live private Drive CRUD uses the configured `google-drive` MCP, while local uploads can use the bundled user-OAuth script as a fallback.

If `ACCOUNT-PROFILE.md` exists beside this file, read it before selecting the Google account, OAuth credential path, MCP route, or fallback CLI. Create it from `ACCOUNT-PROFILE.example.md`; it is local routing metadata and must never contain credential values or be committed.

## Cross-model hard gates

Use these gates literally on every model:

1. Parse an exact Drive URL or ID before searching by name
2. Read `references/ROUTING.md` and `references/CRUD.md`
3. Use the `google-drive` MCP for private Drive and native Docs, Sheets, or Slides CRUD
4. Resolve one exact object before a write; stop for ambiguity instead of selecting the first search result
5. Perform only the requested CRUD operation
6. Read the affected object back and verify its ID, name, parent/location, and changed content or permission

Never substitute web search or a local same-named file for private Drive content. Never test deletion on real data.

## Route the request

1. Read [references/ROUTING.md](references/ROUTING.md).
2. Read [references/CRUD.md](references/CRUD.md) for every Drive create, read, update, delete, permission, or native Google file request.
3. For private Drive access, use the configured `google-drive` MCP or the pre-built Python CLI scripts in `scripts/drive_crud.py`.
4. For Python CLI operations without MCP, run `python3 scripts/drive_crud.py <C|R|U|D> [options]`.
   - Read (`R`): `python3 scripts/drive_read.py <FILE_ID_OR_URL>` (exports & reads Docs, Sheets, Word, Excel, PDF directly from Cloud).
   - Create (`C`): `python3 scripts/drive_create.py --file <path> --folder-id <id> [--convert]` (uploads or creates items; `--convert` converts Word/Excel to Doc/Sheet).
   - Update (`U`): `python3 scripts/drive_update.py <FILE_ID_OR_URL> [--name <name>] [--move-to <folder_id>]`.
   - Delete (`D`): `python3 scripts/drive_delete.py <FILE_ID_OR_URL> [--permanent] [--yes]`.
5. For first-time Google Cloud and OAuth setup, read [references/GOOGLE_CLOUD_OAUTH_SETUP.md](references/GOOGLE_CLOUD_OAUTH_SETUP.md).
6. For an authentication error, read [references/AUTH.md](references/AUTH.md) and report the exact failing layer: MCP unavailable, OAuth credential missing, access token expired, refresh revoked, scope insufficient, or object permission denied.
7. Read [references/REPORTS.md](references/REPORTS.md) before summarizing or uploading QA reports.

## MCP rules

- Prefer the configured `google-drive` MCP for Drive, Docs, Sheets, Slides, and permission CRUD.
- If its tools are unavailable, say that the MCP is not loaded in the current session. Do not claim the object is missing and do not substitute public web search.
- If the MCP reports authorization required or expired, run the authentication checks in [references/AUTH.md](references/AUTH.md), then retry the same operation.
- Do not repeatedly search the repository for a Drive script when the request belongs to the MCP.

## Local OAuth rules

- `drive.file` is an upload-oriented scope. It does not provide general read access to every existing Drive file.
- Tokens with a refresh token normally refresh automatically. If Google returns `invalid_grant`, the consent was revoked or the refresh token is unusable; run the uploader with `--reauth` only when the user wants to start a new consent flow.
- Never print, copy, commit, or place OAuth client JSON or token JSON in a report.

## Output rules

- Identify the source file by name and link or ID.
- Preserve exact ticket IDs, testcase IDs, verdicts, counts, and evidence links.
- Distinguish source facts from inferences.
- For human-readable content created or updated through Drive CRUD, do not end sentences, list items, or testcase cells with `.` and do not insert emoji or icons.
- Preserve identifiers, URLs, filenames, folder names, sheet/tab names, formulas, code, numeric values, JSON keys, and API fields exactly; the prose-format rule must not mutate machine-readable data.
- Never overwrite a Drive file merely because a same-named file exists. Confirm replace/update semantics first.
- Treat create, upload, update, move, rename, copy, permission, and delete operations as external writes. Resolve the exact target first and follow the confirmation rules in [references/CRUD.md](references/CRUD.md).
