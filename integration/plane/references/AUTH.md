# Plane authentication recovery

## Diagnose

Run with the exact Plane URL when available:

```bash
bash scripts/doctor.sh --url '<Plane workspace or ticket URL>'
```

Interpret results:

- `PLANE_API_KEY is not set`: no credential was provided to the current Codex process.
- `401`: the key is invalid, expired, or revoked.
- `403`: the key is valid but does not have access to the workspace or project.
- DNS, timeout, or `5xx`: connectivity or server failure; do not rotate credentials yet.

## Recover

1. Create or rotate a Personal Access Token in Plane profile settings.
2. Export it before starting Codex. For one key shared across accessible workspaces:

   ```bash
   export PLANE_API_KEY='new-value'
   ```

   For separate keys, use the normalized workspace slug:

   ```bash
   export PLANE_API_KEY_WORKSPACE_A='key-for-workspace-a'
   export PLANE_API_KEY_WORKSPACE_B='key-for-workspace-b'
   ```

3. Restart Codex so the process inherits the variable.
4. Run `bash scripts/doctor.sh` again.

## Browser session recovery

API authentication and browser authentication are separate

- API reads, text-only comments, and state changes use `PLANE_API_KEY`
- Inline Description or Comment images use an authenticated browser profile or a user-created storage state referenced by `PLANE_BROWSER_STATE_PATH`
- To bootstrap a saved Playwright session, run `node scripts/browser-auth.mjs --url '<exact Plane URL>' --state auth.json`
- With explicit user authorization, the helper reads `PLANE_EMAIL` and `PLANE_PASSWORD` only from the ignored local `.env`, fills them in the headed browser, and saves the storage state after `/api/users/me/` confirms authentication
- Never pass a password in shell arguments or print it in logs; complete MFA directly in the browser if the account requires it
- If the browser session expires, rerun the helper and complete the browser checkpoint, then resume
- Keep `PLANE_PASSWORD` only in the ignored `.env`; never copy it to `auth.json`, Markdown, payloads, logs, reports, or source control
- `auth.json`, `*.auth.json`, `storage-state*.json`, and `*.storage-state.json` are ignored by the skill's `.gitignore`

Plane personal API keys do not provide refresh tokens. Automatic refresh is not possible. Never write a password or token into `SKILL.md`, `config.env`, reports, bug payloads, command output, or source control.
