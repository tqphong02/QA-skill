---
name: github-mcp-qa
description: Configure and operate GitHub's official MCP server for repository, Git, pull request, issue, Actions CI/CD, code-quality, and security QA workflows. Use when Codex needs to install or diagnose GitHub MCP, authenticate with OAuth or PAT, switch personal/company accounts, inspect or change GitHub resources, create or monitor CI pipelines, or distinguish GitHub API authentication from local Git SSH authentication.
---

# GitHub MCP QA

Use the official remote endpoint `https://api.githubcopilot.com/mcp/x/all` when full GitHub toolsets are required. Keep authentication local to each user; never place OAuth credentials or PAT values in this repository.

## Route the operation

| Need | Use |
|---|---|
| Local commit, branch, fetch, pull, push | Git CLI with SSH or HTTPS credentials |
| Repository, PR, Issue, Actions, run logs, security data through API | GitHub MCP with OAuth or PAT |
| Edit a workflow | Edit `.github/workflows/*.yml` locally, validate, commit and push |
| Observe or rerun a workflow | GitHub MCP `actions` tools after authentication |

Do not claim that an SSH key authenticates GitHub MCP. SSH and MCP/API authentication are separate.

## Install and diagnose

Read [references/codex-github-mcp-vi.md](references/codex-github-mcp-vi.md) for the complete Vietnamese clone, setup, login, account-switching, PAT, and troubleshooting flow.

For macOS, Linux, or WSL, configure the server with:

```bash
./github-mcp-qa/scripts/install-codex.sh --login
```

Use `--dry-run` before mutation or omit `--login` when the user only wants configuration without opening OAuth. Run [scripts/doctor.sh](scripts/doctor.sh) after setup.

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

- Prefer OAuth for interactive users because scopes can be approved through GitHub
- Use a fine-grained PAT only when OAuth is unavailable; store it in an environment variable or secret manager
- Treat `x/all` as all MCP toolsets, not unlimited GitHub account permission
- Respect organization SSO, GitHub App, PAT, branch-protection, ruleset, and Actions policies
- Logout before changing the MCP identity: `codex mcp logout github`
- Keep personal and company Git identities isolated with separate SSH keys and host aliases

Read [references/qa-mcp-stack-vi.md](references/qa-mcp-stack-vi.md) when selecting GitHub MCP alongside Chrome DevTools, k6, Postman, database read-only, and Slack.
