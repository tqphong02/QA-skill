# Google Drive authentication recovery

## MCP authentication

Symptoms include `authorization required`, `not connected`, or no `google-drive` MCP tools in the session.

1. Confirm the `google-drive` MCP is configured and enabled with `codex mcp get google-drive`.
2. Confirm `GOOGLE_DRIVE_OAUTH_CREDENTIALS` points to a local Desktop OAuth client JSON and `GOOGLE_DRIVE_MCP_SCOPES` includes the requested Drive, Docs, Sheets, or Slides scope.
3. Complete OAuth consent when the MCP requests it.
4. Start a new thread or restart Codex if the tool list does not refresh.
5. Retry the exact file or folder request.

The skill cannot repair MCP OAuth by editing Markdown files.

## Local uploader authentication

Run:

```bash
python3 scripts/drive_auth_doctor.py --refresh
```

Expected files by default:

- OAuth client: `~/.config/drive-oauth-client.json`
- Cached user token: `~/.config/drive-uploader-token.json`

Outcomes:

- Missing client: create a Desktop OAuth client and save the downloaded JSON at the configured path.
- Missing token: the first upload starts browser consent.
- Expired access token plus refresh token: `--refresh` refreshes and rewrites the cache.
- `invalid_grant` or missing refresh token: consent must be repeated. Run the upload command with `--reauth`; the old token is preserved with an `.expired-<timestamp>` suffix.
- `403` on a folder: confirm the authenticated user can edit that folder.

The local `drive.file` scope only accesses files created or explicitly opened through this app. Use the MCP with the required scopes for broad Drive CRUD.

Python uploader dependencies:

```bash
python3 -m pip install google-auth google-auth-oauthlib google-api-python-client
```

Install them only when the local uploader route is needed; the Google Drive MCP does not use these local packages.
