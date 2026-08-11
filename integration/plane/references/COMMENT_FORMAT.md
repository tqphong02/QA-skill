# Plane retest comment format

Use exactly one verdict: `PASS`, `FAILED`, or `BLOCKED`. Do not use `FAIL`, `SUCCESS`, `NG`, emoji, or icons.

Do not end any human-readable sentence or list item with `.`. Keep identifiers, URLs, filenames, numeric values, and machine-readable fields unchanged.

Keep comments short. Do not expose the internal RETEST_PLUS checklist in Plane. Never add Environment, Steps, Observed, Check, an Evidence label, image filenames, browser mode, job IDs, or coverage narration unless the user explicitly requests details.

## PASS

```text
Result: PASS

Conclusion:
- Bug đã được sửa và kết quả đúng kỳ vọng

[inline images only]
```

State after PASS: always move the ticket to `Done` after posting the comment and inline evidence.

## FAILED

```text
Result: FAILED

Actual:
- <what still fails, including exact visible error>

Expected:
- <acceptance behavior that is still not met>

Conclusion:
- Bug vẫn còn và cần sửa lại

[inline images only]
```

State after FAILED: always move the ticket to `In Progress` after posting the comment and inline evidence.

## BLOCKED

```text
Result: BLOCKED

Blocker:
- <blocking condition>

Conclusion:
- Chưa thể kết luận PASS hoặc FAILED vì <blocker>

[inline images only]
```

State after BLOCKED: keep the current state.

## Plane HTML

- Render Result as one paragraph.
- Render Conclusion and the optional Actual, Expected, or Blocker sections with compact `<ul>` blocks.
- Paste each screenshot into the authenticated browser editor so the image renders inside the comment content.
- Do not call `/issue-attachments/` or use the ticket-level Attach control. The ticket must remain at `Attachments 0`.
- Do not render an Evidence heading, local path, filename, direct link, or attachment list in comment text. Evidence is the inline image itself.

## Posting

Preferred deterministic flow:

```bash
python3 comments/post-result.py result.json --dry-run
node scripts/browser-inline-evidence.mjs --input request.json
node scripts/browser-inline-evidence.mjs --input request.json --apply
```

Use the authenticated browser editor for the final comment and image paste. The
script's non-dry-run image path is legacy attachment-backed behavior and must
not be used for the browser-first workflow

Free-form text-only comment compatibility:

```bash
python3 comments/post-inline.py \
  --ref PROJ-150 \
  --html '<p><strong>Result:</strong> PASS</p><p><strong>Conclusion:</strong> Bug đã được sửa và kết quả đúng kỳ vọng</p>'
```

Do not pass `--img` in the browser-first workflow. Validate the image paths with
`post-result.py --dry-run`, then paste the screenshots into the authenticated
browser editor as described below

## Browser posting with inline images

1. Put `{{PLANE_COMMENT_IMAGE_N}}` at each intended image position in `comment_html`
2. Declare the matching paths in `comment_images`
3. Run `browser-inline-evidence.mjs` without `--apply` to validate format and placeholders
4. Run it with `--apply` only when the user authorized the comment write
5. The helper opens the exact ticket, stages each image through browser paste, inserts clean `<image-component>` nodes, posts the comment, and reads it back
6. Confirm exact comment ID, expected image-node count, visible previews, expected state, no placeholders, no `/issue-attachments/`, and `Attachments 0`

If the browser session is logged out or unavailable, return `BLOCKED` and do not post an attachment-backed substitute

For browser-inline evidence, `browser-inline-evidence.mjs` resolves the target state by exact name after posting. PASS moves to `Done`, FAILED moves to `In Progress`, and BLOCKED does not change state
