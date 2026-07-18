# Plane retest comment format

Use exactly one verdict: `PASS`, `FAILED`, or `BLOCKED`. Do not use `FAIL`, `SUCCESS`, `NG`, or emoji.

## PASS

```text
Result: PASS

Environment:
- UAT build/version: <value if known>
- Browser: <value>

Steps:
1. <retest action>
2. <retest action>

Observed:
- <verified behavior>

Check:
- <acceptance point>: Đạt
- <acceptance point>: Đạt

Conclusion:
- Bug đã được sửa và kết quả đúng kỳ vọng.

Evidence:
- <image filename or direct link>
```

State after PASS: keep the current state unless the user gives another workflow rule.

## FAILED

```text
Result: FAILED

Environment:
- UAT build/version: <value if known>
- Browser: <value>

Steps:
1. <retest action>
2. <retest action>

Observed:
- <what still fails, including exact visible error>

Expected:
- <acceptance behavior that is still not met>

Check:
- <acceptance point>: Không đạt

Conclusion:
- Bug vẫn còn và cần sửa lại.

Evidence:
- <image filename or direct link>
```

State after FAILED: always move the ticket to `In Progress` after posting the comment and inline evidence.

## BLOCKED

```text
Result: BLOCKED

Environment:
- UAT build/version: <value if known>
- Browser: <value>

Steps:
1. <action completed before the block>

Observed:
- <blocking condition>

Check:
- <acceptance point>: Chưa kiểm tra được

Conclusion:
- Chưa thể kết luận PASS hoặc FAILED vì <blocker>.

Evidence:
- <image filename or direct link>
```

State after BLOCKED: keep the current state unless the user gives another workflow rule.

## Plane HTML

- Render labels as separate `<p><strong>Label:</strong> ...</p>` blocks.
- Render Steps with `<ol>`.
- Render Environment, Observed, Expected, Check, Conclusion, and Evidence with `<ul>` when they contain multiple items.
- Upload each screenshot, obtain its Plane asset ID, and append an editor `<image-component>` node so the image renders directly in the comment.
- Do not paste a local filesystem path as the only evidence. The image must be uploaded to Plane.
- Keep an evidence filename or link in text so the proof remains identifiable if image rendering fails.

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
  --html '<p><strong>Result:</strong> PASS</p><p><strong>Conclusion:</strong> Bug đã được sửa và kết quả đúng kỳ vọng.</p>' \
  --img evidence/retest-step-1.png \
  --img evidence/retest-result.png
```

Run a dry run and verify the ticket reference, verdict, content, and image paths before the external write.

`comments/post-result.py` resolves the project's `In Progress` state by name before writing. For a FAILED result it posts the comment and then updates the ticket state. PASS and BLOCKED do not change state.
