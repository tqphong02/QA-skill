---
name: integration-github
description: Configure and operate GitHub MCP for repositories, pull requests, issues, Actions CI/CD, code quality, and security QA. Trigger on github.com URLs, GitHub MCP, OAuth/PAT, account switching, repository API reads/writes, or CI monitoring. A bare GitHub URL authorizes only safe inspection. Auto-route; do not require the skill name.
mode: integration
surface: source-control
role: connector
legacy_aliases: github-mcp-qa
---

# GitHub MCP QA

Use the official remote endpoint `https://api.githubcopilot.com/mcp/` for all GitHub toolsets or a scoped `/x/<toolset>` endpoint when fewer tools are sufficient. Keep authentication local to each user; never place OAuth credentials or PAT values in this repository.

## Route the operation

| Need | Use |
|---|---|
| Local commit, branch, fetch, pull, push | Git CLI with SSH or HTTPS credentials |
| Repository, PR, Issue, Actions, run logs, security data through API | GitHub MCP with OAuth or PAT |
| Edit a workflow | Edit `.github/workflows/*.yml` locally, validate, commit and push |
| Observe or rerun a workflow | GitHub MCP `actions` tools after authentication |

Do not claim that an SSH key authenticates GitHub MCP. SSH and MCP/API authentication are separate.

## Hard gates

1. Resolve the exact repository, branch, issue, pull request or workflow before any operation
2. Treat a bare URL as read-only inspection; do not infer a mutation from a link
3. Run the host-specific doctor and distinguish `mcp_not_configured`, `mcp_not_loaded`, `auth_required`, `runtime_missing` and `permission_denied`
4. Require explicit confirmation immediately before external writes and read back the changed object or run
5. Never print, store or commit OAuth tokens, PAT values, cookies or private repository data

## Install and diagnose

Select the guide for the active host:

- Codex: read [references/codex-github-mcp-vi.md](references/codex-github-mcp-vi.md)
- Antigravity: read [references/antigravity-github-mcp-vi.md](references/antigravity-github-mcp-vi.md)

For macOS, Linux, or WSL, configure the server with:

```bash
./integration/github/scripts/install-codex.sh --login
```

Use `--dry-run` before mutation. Codex defaults to PAT from `GITHUB_PAT_TOKEN`; use `--login` only when that Codex version can complete GitHub OAuth. Run the host-specific doctor after setup.

## Execute GitHub work

1. Resolve `owner/repo`, target branch, current account, and requested operation
2. Read repository state before any write
3. For local changes, inspect `git status`, preserve unrelated changes, and use Git CLI
4. For GitHub API changes, verify the authenticated account and repository permission first
5. Require explicit confirmation immediately before deleting repositories, branches, releases, packages, workflow artifacts, secrets, or changing security/organization settings
6. Read back the changed object or workflow run after mutation
7. Report the exact repository, branch, commit/run ID, status, and remaining blocker

## CI/CD rules

- Inspect existing workflows and repository conventions before creating a pipeline
- Pin action versions according to repository policy; never expose secrets in YAML, logs, artifacts, or prompts
- Give `GITHUB_TOKEN` only the workflow permissions required by its jobs
- Validate syntax and relevant tests locally before push
- Treat dispatch, rerun, cancel, deployment approval, secret rotation, and permission changes as state-changing operations
- Separate pipeline creation from production deployment authorization

## Authentication boundaries

- Prefer OAuth only when the active host supports the GitHub OAuth flow; otherwise use a fine-grained PAT from an environment variable or secret manager
- Use a fine-grained PAT only when OAuth is unavailable; store it in an environment variable or secret manager
- Treat `x/all` as all MCP toolsets, not unlimited GitHub account permission
- Respect organization SSO, GitHub App, PAT, branch-protection, ruleset, and Actions policies
- Clear the active host OAuth session or change the PAT environment when switching MCP identity
- Keep personal and company Git identities isolated with separate SSH keys and host aliases

Read [references/qa-mcp-stack-vi.md](references/qa-mcp-stack-vi.md) when selecting GitHub MCP alongside Chrome DevTools, k6, Postman, database read-only, and Slack.

When the user asks which QA MCP servers are connected or reports that a skill exists but its tool is missing, run `scripts/doctor-stack.sh --agent=<host>` before suggesting installation. Do not treat a configured server as loaded until a new host session exposes its tools and a read-only smoke test succeeds.
