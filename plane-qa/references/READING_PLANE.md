# Read Plane content without changing its format

## Ticket reading order

Read and present these fields in order:

1. Reference and title
2. State, priority, cycle, assignees, labels
3. Description sections in their original order
4. Linked testcase or internal reference
5. Evidence and attachments
6. Comments from oldest to newest, with author and timestamp

Convert Plane HTML to readable Markdown while preserving paragraph, line-break, ordered-list, and unordered-list boundaries. Do not flatten numbered Steps into prose. Do not expose raw HTML unless requested.

## Classify before formatting

- A bug ticket contains `Precondition`, `Steps`, `Expected`, and `Actual`; render it with the bug section names.
- A daily or cycle report contains `Task`, testcase totals or progress, `Evidence`, `Bug log`, `Blocker`, and `Next plan`; render it as a plain list.
- A retest comment is a comment, not a replacement bug report. Keep verdict, observed result, conclusion, and evidence under the comment.
- If the source is incomplete or mixed, preserve what exists and mark missing sections as `Không có trong Plane`. Do not fabricate a canonical report.

## Summary rule

When the user asks to "đọc" or "tóm tắt", summarize facts from the ticket but retain exact error messages, testcase IDs, links, and evidence names. Clearly distinguish source text from any inference.
