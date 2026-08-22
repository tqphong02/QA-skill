---
name: integration-plane
description: Manage Plane QA tickets, bugs, comments, states, reports, and browser-pasted inline evidence. Trigger on Plane URLs or ticket IDs, retest/verify, log or update bug, and PASS/FAILED/BLOCKED comments. A bare Plane URL or ID authorizes doctor plus read; retests route through dynamic-web-exploratory RETEST_PLUS. Auto-route; do not require the skill name.
mode: integration
surface: project-management
role: connector
legacy_aliases: plane-qa
---

# Plane QA

Use only the bundled CLI/scripts and the authenticated browser editor. Resolve paths from this skill directory. Read [QUICK_REF.md](QUICK_REF.md) immediately after this file; when local account metadata is needed, use [ACCOUNT-PROFILE.example.md](ACCOUNT-PROFILE.example.md) as the template and never put credentials there

## Model/provider enforcement

Apply these gates to every model/provider:

- A Plane URL or ticket ID by itself is a complete read request
- Run `scripts/doctor.sh` before every live read/write and use the exact supplied workspace URL
- Read the format reference before drafting; use canonical dry-run scripts when available
- A bare URL authorizes read-only inspection, not mutation; create/update/comment/assign/archive/delete needs explicit operation, target and confirmation
- For image Description/Comment work, read [references/BROWSER_EDITOR.md](references/BROWSER_EDITOR.md), build `inline-evidence-template.json`, run `node scripts/browser-inline-evidence.mjs --input <request.json>`, then add `--apply` only after authorized write
- Keep `Attachments 0`; never click ticket `Attach`, call `/issue-attachments/` or replace browser-pasted evidence with an attachment
- Read back ticket/comment workspace, reference, content, rendered image node, placeholders, attachment count and state

## Cross-model hard gates

Retest chain: `integration-plane` read → `dynamic-web-exploratory` RETEST_PLUS → `integration-plane` comment/state
Contract literal: integration-plane read → dynamic-web-exploratory RETEST_PLUS → integration-plane comment/state

1. Parse the exact target; do not guess missing ticket, project, role, expected/actual or evidence
2. Use `PASS → Done`, `FAILED → In Progress`, `BLOCKED → unchanged`, `new bug → Todo`; unknown state is `BLOCKED`. Contract literals: PASS → Done; FAILED → In Progress; new bug → Todo
3. For images, use exact `{{PLANE_DESCRIPTION_IMAGE_N}}` and `{{PLANE_COMMENT_IMAGE_N}}` placeholders and accept success only when read-back proves rendered nodes, `Attachments 0`, empty `issue_attachment_requests`, no placeholders and requested state
4. If browser editor/auth is unavailable, stop the image operation as `BLOCKED`; never fall back to `/issue-attachments/`

## Workflow and route the request

- Plane URL/ID only → `bash scripts/doctor.sh --url '<URL>'`, then read the exact ticket
- Plane URL/ID plus retest, re-test, verify, `kiểm tra lại`, PASS, FAILED or BLOCKED → doctor/read → `dynamic-web-exploratory` RETEST_PLUS → return here for comment/state
- Create/update/comment/state/report → exact Plane operation after dry-run/confirmation and read-back
- Multiple workspaces → read [references/MULTI_WORKSPACE.md](references/MULTI_WORKSPACE.md)
- Ticket/report read → [references/READING_PLANE.md](references/READING_PLANE.md); bug draft → [BUG_FORMAT.md](BUG_FORMAT.md); verdict/comment → [references/COMMENT_FORMAT.md](references/COMMENT_FORMAT.md); daily/cycle report → [REPORT_FORMAT.md](REPORT_FORMAT.md)

## Browser-first image route

Open the exact authenticated ticket URL, reuse authorized storage state, and use `browser-inline-evidence.mjs` to stage each file into the rich-text editor at its placeholder. Save/reload and verify rendered image, persisted image node, no duplicated sections, no placeholders, `Attachments 0`, no `/issue-attachments/` request and requested state. Keep `Attach` unused. If login/MFA/editor cannot complete, return `BLOCKED (AUTH_REQUIRED)`

## Authentication and commands

- API uses `PLANE_API_KEY` or workspace-specific key; never print, commit or put it in ticket content
- Browser credentials/storage state stay in ignored `.env`/state files; never print passwords or copy them to tracked output
- On `401`/`403`, stop and classify missing/expired/revoked/access-denied key; do not use browser credentials for API calls

```text
bash scripts/doctor.sh
bash scripts/doctor.sh --url '<Plane URL>'
node scripts/browser-auth.mjs --url '<exact URL>' --state auth.json
node scripts/browser-inline-evidence.mjs --input request.json
node scripts/browser-inline-evidence.mjs --input request.json --apply
./plane.sh issue list <project_id>
./plane.sh issue get <issue_uuid> <project_id>
python3 work-items/log-bug.py bug.json --dry-run
python3 comments/post-result.py result.json --dry-run
```

## Output rules

Return a readable QA summary, not raw JSON unless requested. Keep title/status/priority/assignee/URL/description/comments/evidence distinct. Preserve IDs, URLs, filenames and machine values; use Vietnamese with diacritics; no emoji/icons and no trailing `.` in reader-visible content. Retest comments are concise: PASS = Result + Conclusion + inline images; FAILED adds Actual + Expected; BLOCKED adds Blocker. Never invent missing fields
