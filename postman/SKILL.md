---
name: postman
description: Configure, authenticate, diagnose, and operate Postman through its official MCP server, including workspaces, collections, environments, specifications, mocks, and monitors. Trigger on Postman setup, Postman MCP, Postman OAuth, missing Postman tools or skill, workspace or collection management, or requests to connect an agent to Postman; do not require the skill name.
---

# Postman

Use the official remote Postman MCP server. Bootstrap the connection deterministically before attempting Postman operations.

## First-use bootstrap

1. Resolve the active host as `antigravity` or `codex`
2. Before changing local configuration, state:
   - `Target`: the exact MCP config or Codex MCP entry
   - `Operation`: add or enable `mcpServers.postman`
   - `Required input`: Postman account login in the OAuth browser
   - `Write action`: merge only the Postman entry and back up an existing Antigravity config
   - `Verification`: config read-back followed by a read-only workspace listing
3. Run:

```bash
python3 scripts/bootstrap.py --agent=<antigravity|codex>
```

The script is idempotent. Run it again when Postman tools are missing. Use `--check` for a read-only configuration check and `--dry-run` to preview the target and payload

4. For Antigravity, fully restart the IDE, run `/mcp`, select `postman`, and complete OAuth
5. For Codex, run `codex mcp login postman` when the bootstrap reports that login is required
6. Continue only after this read-only smoke test succeeds:

```text
List the Postman workspaces available to the active account without changing anything
```

OAuth consent is the only required user interaction for the US endpoint. Never request, print, or store the user's Postman password. Never commit API keys, access tokens, refresh tokens, cookies, or OAuth browser data

## Endpoint selection

- Use `minimal` by default for workspaces, collections, environments, and specifications
- Use `code` only for client-code and API-context workflows
- Use `full` only when a required tool is absent from `minimal`
- Use `--region=eu` only for an EU Postman account; EU requires an API key supplied through a protected environment or secret manager

Change the mode deterministically:

```bash
python3 scripts/bootstrap.py --agent=<agent> --mode=<minimal|code|full> --replace-endpoint
```

## Operation workflow

1. Resolve the exact account, team, workspace, collection, environment, specification, mock, or monitor
2. Use read-only discovery before any mutation
3. Record a mutation contract with target, operation, required inputs, write action, and verification
4. Execute only the requested Postman operation
5. Read the object back and verify its ID, parent workspace, name, and changed content

Route contract validation against a live implementation to `api-contract-qa`. Route explicit testcase document creation to `testcase-template`. Use Newman or Postman CLI for reproducible collection execution when available

## Failure classification

- `mcp_not_configured`: run `scripts/bootstrap.py`
- `mcp_not_loaded`: restart the host and open `/mcp`
- `auth_required`: complete OAuth with the intended Postman account
- `workspace_permission_denied`: verify account, team, and workspace membership
- `tool_not_enabled`: switch endpoint mode only when the requested operation requires it
- `runtime_missing`: install or repair the selected agent runtime

Do not report the integration as working based only on valid JSON. Require a successful read-only Postman response
