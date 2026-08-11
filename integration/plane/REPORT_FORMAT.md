# Plane daily and cycle report format

Read this file completely before drafting or posting a QA daily report or cycle report. This format is not the bug-ticket format.

## Rules

- Use a plain list; do not use Markdown tables.
- Do not use emoji or decorative icons.
- Write Vietnamese with diacritics.
- Use `DD/MM/YYYY` in the heading.
- Use only verified counts. Reconcile totals before publishing.
- Use direct links for evidence and Plane tickets.
- Keep PASS, FAILED, BLOCKED, N/A, and UNTESTED distinct. Do not silently merge them.

## Required order

```text
Daily Report - DD/MM/YYYY

Task
- <scope> - <DONE | IN PROGRESS | NOT DONE>

Test summary
- Total: <n>
- PASS: <n>
- FAILED: <n>
- BLOCKED: <n>
- N/A: <n>
- UNTESTED: <n>
- Progress: <done>/<total> (<percent>%)
- Testcase changes: <none or exact additions/removals>

Evidence
- <direct link or artifact path>

Plane bugs
- <ticket ref> [<priority>] <short title> - <testcase ref if known> - <direct link>

Blockers
- <root cause>: <count> case - <testcase IDs> - blocked by <ticket ref>

Next plan
- <next action>
```

Omit a status line only when that status is outside the report's defined scope. If there are no bugs or blockers, write `- Không có` rather than deleting the section.

## Count validation

Before publishing, verify:

```text
Total = PASS + FAILED + BLOCKED + N/A + UNTESTED
```

Define progress explicitly. Default to:

```text
done = PASS + FAILED + BLOCKED + N/A
progress = done / Total
```

If the team uses another definition, state it next to Progress. Never claim `100%` while `UNTESTED > 0` under the default definition.

## Plane bug line

Use one line per ticket:

```text
- PROJ-120 [Medium] Excel ingestion ánh xạ cột số/ngày thành chuỗi - TC-119 - https://...
```

Do not shorten a ticket to `#120` when multiple Plane projects may be in scope. Do not invent an OB reference when the source does not contain one.

## Reading an existing report

Preserve the report's source headings and list order. If it does not match this template, summarize it as-is and separately list format gaps; do not rewrite facts during a read-only request.
