---
name: integration-google-drive
description: Perform Google Drive CRUD for files, folders, Docs, Sheets, Slides, permissions, QA evidence, and reports. Trigger on Drive or Docs URLs/IDs and create, read, search, update, rename, move, copy, upload, download, share, or delete requests. A bare URL or ID authorizes only safe reading. Auto-route; do not require the skill name.
mode: integration
surface: documents
role: connector
legacy_aliases: google-drive-qa
---

# Google Drive QA

Use this skill as the stable workflow layer. A skill does not itself grant Drive access: live private Drive CRUD uses the configured `google-drive` MCP, while local uploads can use the bundled user-OAuth script as a fallback.

If `ACCOUNT-PROFILE.md` exists beside this file, read it before selecting the Google account, OAuth credential path, MCP route, or fallback CLI. Create it from `ACCOUNT-PROFILE.example.md`; it is local routing metadata and must never contain credential values or be committed.

## Cross-model hard gates

Use these gates literally on every model:

1. Treat a bare Drive, Docs, Sheets, or Slides URL/ID as an implicit request to resolve and read that exact object; do not ask which skill to use or stop after explaining the skill
2. Parse an exact Drive URL or ID before searching by name
3. Read `references/ROUTING.md` and `references/CRUD.md`
4. Use the `google-drive` MCP for private Drive and native Docs, Sheets, or Slides CRUD
5. Resolve one exact object before a write; stop for ambiguity instead of selecting the first search result
6. Perform only the requested CRUD operation; a bare URL authorizes read-only inspection, not mutation
7. Read the affected object back and verify its ID, name, parent/location, and changed content or permission

Never substitute web search or a local same-named file for private Drive content. Never test deletion on real data.

A Drive URL or ID by itself is a complete safe-read request

## Route the request

1. Classify before acting:
   - Drive/Docs/Sheets/Slides URL or ID only → resolve and read metadata plus accessible content
   - URL/ID plus read/summarize/analyze language → perform that read-only operation
   - URL/ID plus explicit create/update/rename/move/copy/upload/share/delete language → perform only that mutation after exact-target checks
   - Google Sheet URL plus execute/run testcase language → use `dynamic-web-automation` BUILD_AND_RUN, with this skill handling Sheet CRUD only
2. Read [references/ROUTING.md](references/ROUTING.md).
3. Read [references/CRUD.md](references/CRUD.md) for every Drive create, read, update, delete, permission, or native Google file request.
4. For private Drive access, use the configured `google-drive` MCP or the pre-built Python CLI scripts in `scripts/drive_crud.py`.
5. For Python CLI operations without MCP, run `python3 scripts/drive_crud.py <C|R|U|D> [options]`.
   - Read (`R`): `python3 scripts/drive_read.py <FILE_ID_OR_URL>` (exports & reads Docs, Sheets, Word, Excel, PDF directly from Cloud).
   - Create (`C`): `python3 scripts/drive_create.py --file <path> --folder-id <id> [--convert]` (uploads or creates items; `--convert` converts Word/Excel to Doc/Sheet).
   - Update (`U`): `python3 scripts/drive_update.py <FILE_ID_OR_URL> [--name <name>] [--move-to <folder_id>]`.
   - Delete (`D`): `python3 scripts/drive_delete.py <FILE_ID_OR_URL> [--permanent] [--yes]`.
6. For first-time Google Cloud and OAuth setup, read [references/GOOGLE_CLOUD_OAUTH_SETUP.md](references/GOOGLE_CLOUD_OAUTH_SETUP.md).
7. For an authentication error, read [references/AUTH.md](references/AUTH.md) and report the exact failing layer: MCP unavailable, OAuth credential missing, access token expired, refresh revoked, scope insufficient, or object permission denied.
8. Read [references/REPORTS.md](references/REPORTS.md) before summarizing or uploading QA reports.

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
