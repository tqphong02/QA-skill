---
name: plane-qa
description: Manage and read Plane QA work items across multiple workspaces, detect workspace/project/ticket context from Plane URLs, validate the matching API key, log bug tickets, post PASS, FAILED, or BLOCKED retest comments, embed screenshot evidence, and write daily or test reports. Use when the user mentions Plane, supplies a Plane workspace or ticket URL, references a ticket such as PROJ-102, logs or updates a bug, comments a retest result, pastes evidence images, or reads a QA report. Use the bundled doctor before assuming an expired token or asking for login credentials.
---

# Plane QA

Use the bundled CLI and scripts in this directory. Resolve every path relative to this `SKILL.md`; do not search the current project for another Plane implementation unless this skill's doctor reports that the bundled files are missing.

If `ACCOUNT-PROFILE.md` exists beside this file, read it before choosing a default account, workspace, project, or credential environment-variable name. Create it from `ACCOUNT-PROFILE.example.md`; it is local routing metadata and must never contain credential values or be committed.

## Cross-model hard gates

Use these gates literally on every model. Do not compress, reorder, or infer around them:

1. Resolve the exact target from the supplied URL; only use configured defaults when no URL was supplied
2. Run `scripts/doctor.sh` before every live read or write
3. Read the matching format reference before drafting content
4. Run the canonical script in dry-run mode when it supports `--dry-run`
5. Perform the explicitly requested write
6. Read back the ticket or comment and verify workspace, ticket reference, content, evidence count, and state

Use this state map without interpretation: `PASS → Done`, `FAILED → In Progress`, `BLOCKED → unchanged`, `new bug → Todo`. If a named state cannot be resolved, stop and report `BLOCKED`; never choose a similar-looking state.

## Route the request

1. For any live Plane read or write, run `bash scripts/doctor.sh --url '<Plane URL>'` when the user supplied a URL. Otherwise run `bash scripts/doctor.sh`.
2. Read [references/MULTI_WORKSPACE.md](references/MULTI_WORKSPACE.md) when the user has multiple workspaces or supplies a Plane URL.
3. For reading a ticket or report, read [references/READING_PLANE.md](references/READING_PLANE.md) and preserve the source section order.
4. For creating or rewriting a bug, read [BUG_FORMAT.md](BUG_FORMAT.md) completely before drafting or posting.
5. For retest comments, PASS/FAILED/BLOCKED verdicts, or inline evidence, read [references/COMMENT_FORMAT.md](references/COMMENT_FORMAT.md) completely.
6. For daily or cycle reports, read [REPORT_FORMAT.md](REPORT_FORMAT.md) completely. Do not apply the bug template to a report.
7. Treat create, update, comment, assign, archive, and delete operations as external writes. Show the final payload or a dry run and obtain confirmation before executing unless the user explicitly asked to perform that exact write.

## Authentication

- Plane uses a personal API key, not a refreshable OAuth session. Never claim that the skill can refresh an expired or revoked Plane key.
- Never ask for or accept a Plane account password. API operations require only a Personal API Key.
- When a URL is supplied, parse its origin and workspace slug and select `PLANE_API_KEY_<NORMALIZED_WORKSPACE_SLUG>`, falling back to `PLANE_API_KEY`.
- Never print the selected key or store a new key in tracked files.
- On `401` or `403`, stop retrying, report that the key is missing, expired, revoked, or lacks access, and follow [references/AUTH.md](references/AUTH.md).
- Do not fall back to browser login credentials for API actions.

## Common commands

```bash
bash scripts/doctor.sh
bash scripts/doctor.sh --url 'https://plane.example.com/workspace-a/projects/<project-id>/issues/<issue-id>/'
./plane.sh issue list <project_id>
./plane.sh issue get <issue_uuid> <project_id>
python3 work-items/log-bug.py bug.json --dry-run
python3 work-items/log-bug.py bug.json
python3 comments/post-result.py result.json --dry-run
python3 comments/post-result.py result.json
python3 comments/post-inline.py --ref PROJ-102 --text "Retest PASS" --img evidence.png
```

Prefer `work-items/log-bug.py` over hand-built JSON because it validates and renders the team format consistently. Always run `--dry-run` before creating a bug.

Prefer `comments/post-result.py` for retest comments because it validates the verdict and renders evidence inline. Use `comments/post-inline.py` only for free-form comments.

## Output rules

- Return a readable QA summary, not raw Plane JSON, unless the user asks for JSON.
- Keep title, status, priority, assignees, ticket URL, description sections, comments, and evidence distinct.
- Do not invent missing Expected, Actual, testcase IDs, assignees, or evidence.
- Never include passwords, API keys, cookies, or OAuth tokens in a ticket or report.
- Use Vietnamese with diacritics for content. Do not add emoji or icons to Plane content.
- Do not end human-readable sentences or list items with `.`. Preserve identifiers, URLs, filenames, numeric values, and machine-readable fields exactly.
- Standardize retest verdicts as exactly `PASS`, `FAILED`, or `BLOCKED`; never mix `FAIL` and `FAILED`.
- Keep retest comments concise: PASS contains only Result + Conclusion + inline images; FAILED adds only Actual + Expected; BLOCKED adds only Blocker. Never include Environment, Steps, Observed, Check, an Evidence text label, evidence filenames, internal suite names, browser mode, job IDs, or coverage narration unless the user explicitly asks.
- Create every new bug in `Todo`.
- After a retest result of `PASS`, post the evidence comment and move the ticket to `Done`.
- After a retest result of `FAILED`, post the evidence comment and move the ticket to `In Progress`.
- Do not change state automatically for BLOCKED.
- Prefer a supplied Plane URL over the configured default workspace. Never post to the default workspace when a URL identifies another workspace.
