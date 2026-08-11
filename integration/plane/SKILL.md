---
name: integration-plane
description: Manage Plane QA tickets, bugs, comments, states, reports, and browser-pasted inline evidence. Trigger on Plane URLs or ticket IDs, retest/verify, log or update bug, and PASS/FAILED/BLOCKED comments. A bare Plane URL or ID authorizes doctor plus read; retests route through dynamic-web-exploratory RETEST_PLUS. Auto-route; do not require the skill name.
mode: integration
surface: project-management
role: connector
legacy_aliases: plane-qa
---

# Plane QA

Use the bundled CLI and scripts in this directory for metadata, text-only validation, and state reads. Use the authenticated `dynamic-web-exploratory` browser editor for every image inserted into a Description or Comment. Resolve every path relative to this `SKILL.md`; do not search the current project for another Plane implementation unless this skill's doctor reports that the bundled files are missing.

Read [QUICK_REF.md](QUICK_REF.md) immediately after this file. It contains the canonical commands and read-back contract used by GLM, Gemini, Codex, and every other host.

If `ACCOUNT-PROFILE.md` exists beside this file, read it before choosing a default account, workspace, project, or credential environment-variable name. Create it from `ACCOUNT-PROFILE.example.md`; it is local routing metadata and must never contain credential values or be committed.

## Model/provider enforcement

Apply this policy identically for GLM, Codex, Gemini, and every other model or provider

- Treat [references/BROWSER_EDITOR.md](references/BROWSER_EDITOR.md) as a hard execution contract whenever an image is in scope
- Use `scripts/browser-inline-evidence.mjs` for an existing ticket with inline Description or Comment images; do not improvise ProseMirror cursor placement
- Keep `Attachments 0` as the required postcondition for inline evidence
- Never click the ticket-level `Attach` control or call `/issue-attachments/` for browser-inline evidence
- API and CLI routes may validate, read metadata, read state, post text-only content, or run dry-run checks, but may not substitute an attachment for a browser-pasted image
- If the authenticated browser editor is unavailable, return `BLOCKED` and stop the image operation
- Keep `--legacy-attachment` outside the default workflow and use it only when the user explicitly changes the requirement to attachment-backed evidence

## Cross-model hard gates

Use these gates literally on every model. Do not compress, reorder, or infer around them:

A Plane URL or ticket ID by itself is a complete read request

Retest chain: integration-plane read → dynamic-web-exploratory RETEST_PLUS → integration-plane comment/state

1. Treat a bare Plane URL or ticket ID as an implicit request to inspect/read that ticket; do not ask which skill to use or stop after explaining the skill
2. Resolve the exact target from the supplied URL; only use configured defaults when no URL was supplied
3. Run `scripts/doctor.sh` before every live read or write
4. Read the matching format reference before drafting content
5. Run the canonical script in dry-run mode when it supports `--dry-run`; dry-run is format validation only when images are in scope
6. When images are in scope, build `inline-evidence-template.json`, run `node scripts/browser-inline-evidence.mjs --input <request.json>`, then run the same command with `--apply` only after the write is authorized
7. Perform only the explicitly requested write; a bare URL authorizes read-only inspection, not mutation
8. Read back the ticket or comment and verify workspace, ticket reference, content, inline image node, Attachments count, and state

Use this state map without interpretation: `PASS → Done`, `FAILED → In Progress`, `BLOCKED → unchanged`, `new bug → Todo`. If a named state cannot be resolved, stop and report `BLOCKED`; never choose a similar-looking state.

## Route the request

1. Classify before acting:
   - Plane URL or ticket ID only → doctor and read the exact ticket
   - Plane URL or ticket ID plus retest, re-test, verify, kiểm tra lại, PASS, FAILED, or BLOCKED → doctor/read, then `dynamic-web-exploratory` RETEST_PLUS, then return here for comment/state
   - Log/create/update/comment/state/report language → the matching explicit Plane operation
2. For any live Plane read or write, run `bash scripts/doctor.sh --url '<Plane URL>'` when the user supplied a URL. Otherwise run `bash scripts/doctor.sh`.
3. Read [references/MULTI_WORKSPACE.md](references/MULTI_WORKSPACE.md) when the user has multiple workspaces or supplies a Plane URL.
4. For reading a ticket or report, read [references/READING_PLANE.md](references/READING_PLANE.md) and preserve the source section order.
5. For creating or rewriting a bug, read [BUG_FORMAT.md](BUG_FORMAT.md) completely before drafting or posting.
6. For retest comments, PASS/FAILED/BLOCKED verdicts, or inline evidence, read [references/COMMENT_FORMAT.md](references/COMMENT_FORMAT.md) completely.
7. For any image in a Description or Comment, read [references/BROWSER_EDITOR.md](references/BROWSER_EDITOR.md) completely and establish an authenticated browser session before writing.
8. For daily or cycle reports, read [REPORT_FORMAT.md](REPORT_FORMAT.md) completely. Do not apply the bug template to a report.
9. Treat create, update, comment, assign, archive, and delete operations as external writes. Show the final payload or a dry run and obtain confirmation before executing unless the user explicitly asked to perform that exact write.

## Authentication

- Plane uses a personal API key, not a refreshable OAuth session. Never claim that the skill can refresh an expired or revoked Plane key.
- API operations require only a Personal API Key; browser login credentials must never be used for API requests
- `PLANE_API_KEY` may be filled in the ignored `.env` beside this skill or exported in the process; never print it, commit it, or put it in Plane content
- Optional local fields `PLANE_EMAIL`, `PLANE_PASSWORD`, and `PLANE_BROWSER_STATE_PATH` may be kept only in the ignored `.env`; never print or copy their values into tracked files, logs, Plane content, or command output
- Use `PLANE_PASSWORD` only for browser auto-login when the user explicitly authorizes it; save the resulting authenticated storage state and prefer that state on later runs
- When a URL is supplied, parse its origin and workspace slug and select `PLANE_API_KEY_<NORMALIZED_WORKSPACE_SLUG>`, falling back to `PLANE_API_KEY`.
- Never print the selected key or store a new key in tracked files.
- On `401` or `403`, stop retrying, report that the key is missing, expired, revoked, or lacks access, and follow [references/AUTH.md](references/AUTH.md).
- Do not fall back to browser login credentials for API actions.

## Common commands

```bash
bash scripts/doctor.sh
bash scripts/doctor.sh --url 'https://plane.example.com/workspace-a/projects/<project-id>/issues/<issue-id>/'
node scripts/browser-auth.mjs --url 'https://plane.example.com/workspace-a/browse/PROJ-102/' --state auth.json
node scripts/browser-inline-evidence.mjs --input request.json
node scripts/browser-inline-evidence.mjs --input request.json --apply
./plane.sh issue list <project_id>
./plane.sh issue get <issue_uuid> <project_id>
python3 work-items/log-bug.py bug.json --dry-run
python3 comments/post-result.py result.json --dry-run
# Final image insertion: authenticated browser editor route in references/BROWSER_EDITOR.md
```

Prefer `work-items/log-bug.py --dry-run` over hand-built JSON because it validates and renders the team format consistently. When evidence images exist, paste them into the Description editor through the browser route. Do not execute `log-bug.py` with image evidence unless an explicit legacy attachment workflow is requested.

Prefer `comments/post-result.py --dry-run` for retest format validation. Post the final PASS, FAILED, or BLOCKED comment through the authenticated browser editor. Do not use `comments/post-inline.py --img` for the default workflow.

## Browser-first image route

Use [references/BROWSER_EDITOR.md](references/BROWSER_EDITOR.md) whenever an image must appear inside a Description or Comment

- Open the exact ticket URL in an authenticated browser session
- Reuse `PLANE_BROWSER_STATE_PATH` or the existing browser profile when the runtime supports it
- If the page redirects to login and the user has authorized auto-login, run `node scripts/browser-auth.mjs --url '<exact Plane URL>' --state auth.json`; the helper fills `PLANE_EMAIL` and `PLANE_PASSWORD` from the ignored `.env`, waits for MFA only when required, and saves the ignored storage state
- Never print the password or put it in browser logs, tickets, comments, screenshots, reports, shell arguments, or tracked files; if automatic login and any required MFA cannot complete, return `BLOCKED (AUTH_REQUIRED)`
- Keep the ticket-level `Attach` control unused
- Put `{{PLANE_DESCRIPTION_IMAGE_N}}` or `{{PLANE_COMMENT_IMAGE_N}}` exactly where each image belongs in canonical HTML
- Let `browser-inline-evidence.mjs` paste each file into an authenticated rich-text editor to create the Plane project asset, then rebuild clean HTML with the returned `<image-component>` node
- Do not paste an image after a large HTML paste and trust the current ProseMirror cursor; that can split a word, retain a marker, or duplicate content
- Save, reload, and verify the rendered image, persisted HTML image node, absence of placeholders, no duplicated sections, `Attachments 0`, no `/issue-attachments/` request, and requested state
- If browser authentication or the editor is unavailable, stop as `BLOCKED`; never fall back to `/issue-attachments/`

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
- For browser-pasted images, assert that the final Description or Comment contains the editor image node and that the ticket Attachments count remains `0`
- Treat any `/issue-attachments/` request during the browser image flow as a failed route
- Accept the helper result only when `description_image_nodes`, `comment_image_nodes`, rendered asset IDs, `attachments_count`, `issue_attachment_requests`, `placeholders_absent`, and state all match the declared request
