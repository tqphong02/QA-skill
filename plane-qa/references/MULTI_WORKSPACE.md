# Multiple Plane workspaces

## URL context

For a URL shaped like:

```text
https://projects.example.com/<workspace-slug>/projects/<project-id>/issues/<issue-id>/
```

derive:

- Base URL: `https://projects.example.com`
- Workspace: `<workspace-slug>`
- Project ID: `<project-id>`
- Issue ID: `<issue-id>`

Use these values instead of `PLANE_WORKSPACE_SLUG` and the default project. Support `/issues/` and `/work-items/` ticket routes.

## Key selection

Normalize a workspace slug by uppercasing it and replacing non-alphanumeric characters with `_`.

Examples:

```text
qa-qc-metadatasolutions -> PLANE_API_KEY_QA_QC_METADATASOLUTIONS
workspace-b         -> PLANE_API_KEY_PROJ_PRODUCT
```

Selection order:

1. Workspace-specific environment variable
2. Generic `PLANE_API_KEY`
3. Fail safely and request a Personal API Key

One generic key can be used for both workspaces when the key owner has access to both on the same Plane instance. Use separate workspace keys when the workspaces use different accounts, permissions, or Plane instances.

Never request an account password. Never store a key in `config.env`, JSON input, Markdown, or source control.

## Verify before writing

Run:

```bash
bash scripts/doctor.sh --url '<Plane workspace or ticket URL>'
```

- `200`: the selected key is valid and can access the workspace.
- `401`: the selected key is invalid, expired, or revoked.
- `403`: the key may still be valid but cannot access this workspace.
- `404`: verify the URL and workspace slug.

State the detected base URL, workspace slug, and selected environment-variable name. Never display the key value.
