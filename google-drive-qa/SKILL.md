---
name: google-drive-qa
description: Perform full CRUD on Google Drive files and folders, Google Docs, Sheets, Slides, permissions, QA evidence, and reports. Use when the user mentions Google Drive, a drive.google.com link, a Drive folder or file ID, wants to create, read, search, update, rename, move, copy, upload, download, share, or delete Drive content, or when a previous Drive action failed because OAuth or MCP access expired. Check the MCP and authentication route before searching elsewhere.
---

# Google Drive QA

Use this skill as the stable workflow layer. A skill does not itself grant Drive access: live private Drive CRUD uses the configured `google-drive` MCP, while local uploads can use the bundled user-OAuth script as a fallback.

If `ACCOUNT-PROFILE.md` exists beside this file, read it before selecting the Google account, OAuth credential path, MCP route, or fallback CLI. Create it from `ACCOUNT-PROFILE.example.md`; it is local routing metadata and must never contain credential values or be committed.

## Route the request

1. Read [references/ROUTING.md](references/ROUTING.md).
2. Read [references/CRUD.md](references/CRUD.md) for every Drive create, read, update, delete, permission, or native Google file request.
3. For private Drive access, use the configured `google-drive` MCP. Never use public web search as a substitute.
4. For a local file upload fallback, run `python3 scripts/drive_auth_doctor.py --refresh`, then use `python3 scripts/drive_upload.py <file> <folder_id>`.
5. For an authentication error, read [references/AUTH.md](references/AUTH.md) and report the exact failing layer: MCP unavailable, OAuth credential missing, access token expired, refresh revoked, scope insufficient, or object permission denied.
6. Read [references/REPORTS.md](references/REPORTS.md) before summarizing or uploading QA reports.

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
- Never overwrite a Drive file merely because a same-named file exists. Confirm replace/update semantics first.
- Treat create, upload, update, move, rename, copy, permission, and delete operations as external writes. Resolve the exact target first and follow the confirmation rules in [references/CRUD.md](references/CRUD.md).
