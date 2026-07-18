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

Plane personal API keys do not provide refresh tokens. Automatic refresh is not possible. Never provide an account password and never write a token into `SKILL.md`, `config.env`, reports, bug payloads, command output, or source control.
