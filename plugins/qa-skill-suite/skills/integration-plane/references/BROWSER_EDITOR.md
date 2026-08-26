# Plane browser editor route

Use this route whenever an image must appear inside a work-item Description or Comment and the ticket must keep `Attachments 0`

Use `scripts/browser-inline-evidence.mjs` as the canonical low-freedom implementation. GLM, Gemini, Codex, and every other provider must run the same helper instead of reconstructing browser paste logic from memory

## Preconditions

- Resolve the exact Plane URL, workspace, project, and ticket
- Run `scripts/doctor.sh --url '<Plane URL>'` before the live read or write
- Open the exact ticket in an authenticated browser session for the matching workspace
- Reuse `PLANE_BROWSER_STATE_PATH` or the existing browser profile when the browser runtime supports it
- If the page is a login screen and the user authorized auto-login, run `node scripts/browser-auth.mjs --url '<exact Plane URL>' --state auth.json`; the headed helper fills `PLANE_EMAIL` and `PLANE_PASSWORD` from the ignored `.env`, waits for MFA only when required, verifies `/api/users/me/`, and saves the ignored state
- Confirm the page is not a login screen and confirm the ticket reference after authentication
- Record the pre-state: Description HTML, Comment count, Attachments count, and ticket state
- Keep the local image path available to the browser tool
- Never print local account values from `.env`; persist credentials only in the ignored `.env` and persist browser cookies only in the ignored storage state

If the browser session remains logged out after the user checkpoint, is unavailable, or points to another workspace, return `BLOCKED (AUTH_REQUIRED)`. Do not use an API attachment fallback

## Prohibited routes

- Do not click the ticket-level `Attach` button
- Do not call `/issue-attachments/`
- Do not call `post-inline.py --img` in the default workflow
- Do not run `post-result.py` actual mode with evidence images
- Do not run `log-bug.py` actual mode with evidence images unless the user explicitly requests the legacy attachment workflow

## Description

1. Build canonical Description HTML from `BUG_FORMAT.md`
2. Put `{{PLANE_DESCRIPTION_IMAGE_N}}` exactly where each image belongs
3. Declare the matching local paths in `description_images`
4. Run `node scripts/browser-inline-evidence.mjs --input request.json`
5. Run the same command with `--apply` only when the write is authorized
6. The helper opens the exact ticket, stages each image through a browser paste into a rich-text editor, captures the Plane project asset ID, rebuilds clean HTML, and patches Description through the authenticated browser session
7. Do not type or paste all HTML and then paste the image at the current cursor because ProseMirror can split a word, retain a marker, or duplicate content

## Comment

1. Compose exact HTML from `COMMENT_FORMAT.md`
2. Put `{{PLANE_COMMENT_IMAGE_N}}` exactly where each image belongs
3. Declare matching paths in `comment_images`
4. Use the same dry-run then `--apply` helper flow
5. Let the helper create or update the clean comment and read back the exact comment ID

PASS format:

```text
Result: PASS

Conclusion:
- Bug đã được sửa và kết quả đúng kỳ vọng

[ảnh được paste trong editor]
```

FAILED adds only `Actual` and `Expected` before `Conclusion`. BLOCKED adds only `Blocker` before `Conclusion`

## Verification

After saving, verify all of the following

- The Description or Comment visibly renders the image inside rich-text content
- Persisted `description_html` or `comment_html` contains an editor image node or equivalent image element
- The ticket's Attachments count remains unchanged and is `0` when the pre-state was `0`
- The network log contains no `/issue-attachments/` request for the image flow
- The final HTML contains no `{{PLANE_DESCRIPTION_IMAGE_N}}` or `{{PLANE_COMMENT_IMAGE_N}}` placeholder
- The final Description and Comment contain exactly the declared number of `<image-component>` nodes and no duplicated format sections
- The ticket reference and workspace are correct
- State matches the requested verdict: PASS → `Done`, FAILED → `In Progress`, BLOCKED → unchanged

If the image is visible only in Attachments, the browser-inline requirement is `FAILED`. If the browser cannot authenticate or the editor cannot be reached, the image operation is `BLOCKED`

Allowed image transport from the browser editor is the project asset flow under `/api/assets/v2/workspaces/.../projects/.../` plus `/uploads`. This is not a ticket Attachment. Any `/issue-attachments/` request fails the run

## Rollback

If this run creates an unintended comment or attachment, record the pre-state, delete only artifacts from the current run, restore Description and state to the pre-state, then read the ticket back
