# Plane QA quick reference

Read this file immediately after `SKILL.md`

## Mandatory order

1. Parse the exact Plane URL and run `bash scripts/doctor.sh --url '<URL>'`
2. Read `BUG_FORMAT.md` for bug content, `references/COMMENT_FORMAT.md` for verdict comments, and `references/BROWSER_EDITOR.md` whenever an image is in scope
3. Record `Target`, `Operation`, `Required inputs`, `Write action`, and `Verification`
4. Build one input JSON from `inline-evidence-template.json`
5. Run the local validation first

```bash
node scripts/browser-inline-evidence.mjs --input request.json
```

6. Run the external write only when explicitly authorized

```bash
node scripts/browser-inline-evidence.mjs --input request.json --apply
```

7. Accept success only when read-back reports the exact ticket, expected Description and Comment image counts, visible rendered assets, expected state, `attachments_count: 0`, an empty `issue_attachment_requests`, and no placeholders

Published model-host copies must keep their own ignored `.env` containing only `PLANE_LOCAL_CONFIG_DIR=<canonical-integration-plane-folder>`. The helper then reads credential and storage-state settings from that explicit directory without copying secret values

## Image placeholders

- Description image 1: `{{PLANE_DESCRIPTION_IMAGE_1}}`
- Description image 2: `{{PLANE_DESCRIPTION_IMAGE_2}}`
- Comment image 1: `{{PLANE_COMMENT_IMAGE_1}}`
- Comment image 2: `{{PLANE_COMMENT_IMAGE_2}}`

Each declared image must have exactly one matching placeholder. Never paste an image immediately after a large HTML paste and rely on the current ProseMirror cursor because that can split or duplicate content

## Non-negotiable rules

- Stage every image through the authenticated Plane rich-text browser editor
- Use the browser-created project asset only inside Description or Comment content
- Never click ticket-level `Attach`, call `/issue-attachments/`, or accept an Attachments item as inline evidence; `Attachments 0` is mandatory
- Never copy `.env` or browser state into another model host; helpers reuse the ignored local Plane config and storage state
- Return `BLOCKED` when authentication, editor staging, exact state resolution, or read-back verification fails
