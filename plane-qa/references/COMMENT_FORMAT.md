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
- Upload each screenshot, obtain its Plane asset ID, and append an editor `<image-component>` node so the image renders directly in the comment.
- Do not render an Evidence heading, local path, filename, direct link, or attachment list in comment text. Evidence is the inline image itself.

## Posting

Preferred deterministic flow:

```bash
python3 comments/post-result.py result.json --dry-run
python3 comments/post-result.py result.json
```

Free-form comment with inline images:

```bash
python3 comments/post-inline.py \
  --ref PROJ-150 \
  --html '<p><strong>Result:</strong> PASS</p><p><strong>Conclusion:</strong> Bug đã được sửa và kết quả đúng kỳ vọng</p>' \
  --img evidence/retest-step-1.png \
  --img evidence/retest-result.png
```

Run a dry run and verify the ticket reference, verdict, content, and image paths before the external write.

`comments/post-result.py` resolves the target state by name before writing. PASS posts the comment and moves the ticket to `Done`. FAILED posts the comment and moves the ticket to `In Progress`. BLOCKED does not change state.
