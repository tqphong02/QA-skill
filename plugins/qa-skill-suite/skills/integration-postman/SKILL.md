---
name: integration-postman
description: Configure, authenticate, diagnose, and operate Postman MCP, Postman CLI, and Newman for workspaces, collections, environments, specifications, mocks, monitors, local runs, reports, and CI. Trigger on Postman setup, OAuth, missing tools, collection runs, or workspace management. Auto-route; do not require the skill name.
mode: integration
surface: api
role: connector
legacy_aliases: postman
---

## Plugin runtime contract

When this skill is loaded from QA Skill Suite, treat the directory containing this `SKILL.md` as `SKILL_ROOT` and its parent as `PLUGIN_SKILLS_ROOT`. Resolve bundled scripts, references, templates, and sibling skills from those directories. Do not copy plugin assets into the user's project. Invoke a bundled script by its resolved absolute path while keeping the user's project as the working directory, unless that script explicitly requires another working directory.


<!-- qa-runs-contract:start -->
## Local run organization

When this workflow creates local reports, evidence, logs, converted intermediates, or other non-source deliverables and the user did not request an exact output path:

1. Start a fresh run with `node <skill-root>/scripts/qa-runs.mjs start --skill <skill-name> --label <short-scope>` when the bundled helper exists. In a QA-skill source checkout use `<repo-root>/scripts/qa-runs.mjs`. If neither helper exists, create the same layout manually
2. Keep every run-owned file under the returned `<project-root>/qa-runs/<skill-name>/<timestamp>_<scope>/` directory. Never emit generated files into the project root or overwrite an earlier run
3. Put the primary human-readable summary at `report.md` when the output format permits. Preserve required machine-readable and native filenames inside the same run directory
4. Finish the run with `qa-runs.mjs finish --run-dir <run-dir> --status <status> [--primary <report-path>]` so `LATEST.md`, `INDEX.md`, root `latest.json`, and per-skill `latest.json` point to the newest run
5. In the final response, link the primary report, the timestamped run directory, and `qa-runs/INDEX.md`; identify the run ID and status explicitly

An exact user path, a source-code deliverable that belongs in the target repository, or a safety-mandated location overrides this layout. Register or link the result without copying secrets or sensitive evidence into the index
<!-- qa-runs-contract:end -->
# Postman

Read [QUICK_REF.md](QUICK_REF.md) for UI marketplace installation, free API key generation, and quick authentication steps.

Use the official remote Postman MCP server for resource management. Use the bundled Postman CLI and Newman runtimes for reproducible collection execution.

## Hard gates

1. Resolve the exact Postman host, account, workspace, collection or environment before acting
2. Treat local configuration and collection runs as separate from MCP OAuth; never request or store a password, token or API key in the repository
3. Run the bundled runtime doctor and classify `mcp_not_configured`, `mcp_not_loaded`, `auth_required`, `runtime_missing` and engine incompatibility explicitly
4. Use dry-run/read-only discovery before any Postman or MCP mutation and read back the changed object after a requested write
5. Stop collection execution when the target, environment, authorization or stop condition is missing

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

## Collection runtime

Run the runtime doctor before collection execution:

```bash
python3 scripts/runner.py doctor
```

Use the unified runner instead of assembling CLI commands manually:

```bash
python3 scripts/runner.py run <collection-path-or-id> \
  --environment <environment-path-or-id> \
  --bail \
  --report-dir evidence/postman
```

Engine selection is deterministic:

1. Prefer Postman CLI for every supported collection
2. Fall back to Newman only for JSON collection v2 or v2.1
3. Block Newman for Postman v3 YAML collections
4. Preserve the selected engine's exit code for CI

The runner creates `console.log` when `--report-dir` is supplied. For compatible v2 collections it also creates `report.json` and `junit.xml`. Authenticate the Postman CLI only when a cloud collection ID, cloud result upload, monitor, or another authenticated command requires it:

```bash
python3 scripts/runner.py login
```

Local collection paths do not require a Postman API key. Do not place API keys in collection URLs or command arguments; use the Postman CLI login flow or a protected CI secret

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

Route contract validation against a live implementation to `hybrid-api-contract`. Route explicit testcase document creation to `support-testcase-authoring`. Execute collections through `scripts/runner.py`

## Failure classification

- `mcp_not_configured`: run `scripts/bootstrap.py`
- `mcp_not_loaded`: restart the host and open `/mcp`
- `auth_required`: complete OAuth with the intended Postman account
- `workspace_permission_denied`: verify account, team, and workspace membership
- `tool_not_enabled`: switch endpoint mode only when the requested operation requires it
- `runtime_missing`: run dependency setup, then `scripts/runner.py doctor`
- `incompatible engine=newman collection=v3`: use Postman CLI

Do not report the integration as working based only on valid JSON. Require a successful read-only Postman response
