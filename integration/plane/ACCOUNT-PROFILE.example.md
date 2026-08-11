# Plane account profile example

This optional local file contains non-secret routing metadata. Copy it to `ACCOUNT-PROFILE.md`; that filename is gitignored.

- Account email: `qa-user@example.com`
- Base URL: `https://plane.example.com`
- Workspace slug: `workspace-a`
- Default project ID: `<project-uuid>`
- API key environment variable: `PLANE_API_KEY_WORKSPACE_A`

For each additional workspace, add its slug, URL, default project ID, and environment-variable name. Never add a password, API key value, token, or cookie.
