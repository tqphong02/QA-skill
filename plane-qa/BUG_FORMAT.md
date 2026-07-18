# Plane bug format

Read this file completely before drafting, rewriting, or posting a bug.

## Canonical format

Title:

```text
[W<week>][<Module>] <triệu chứng người dùng quan sát được bằng tiếng Việt có dấu>
```

Description fields, in this exact order:

```text
OS: <operating system and version>
Browser: <browser and version>
Environment: <UAT, staging, production, and so on>
URL: <direct reproduction URL>
Test account: <email or safe account identifier; never include a password>
Test data: <record, file, table, field, or input used>

Precondition:
1. <condition>

Steps:
1. <user action>
2. <user action>

Expected:
<expected user-visible behavior>

Actual:
<observed user-visible behavior and exact error text>

Evidence:
- <attachment or direct link>
- Testcase: <ID, only when the source provides it>

Technical note:
<optional short API, status, request ID, or log clue for developers>
```

The labels stay exactly as shown. The content is Vietnamese with diacritics. `Technical note` is optional; all other sections are required unless the source genuinely lacks the field.

## Plane HTML rendering

- Render each scalar label as a separate `<p>` with `<strong>` around the label.
- Render `Precondition` and `Steps` as `<ol><li>...</li></ol>`.
- Render multi-item `Expected`, `Actual`, and `Evidence` as `<ul><li>...</li></ul>`.
- Keep `Expected` and `Actual` in separate blocks.
- Use a clickable `<a>` for URL fields when posting HTML.
- Do not use Markdown tables inside a Plane issue description.

## Writing rules

- Describe `screen -> action -> observed result -> expected result` so another manual tester can reproduce the issue.
- Put the user-visible symptom in the title. Do not put an endpoint, HTTP status, class name, or stack trace in the title.
- Copy exact visible error text into `Actual`.
- Put API, payload, HTTP status, database, or stack information only in `Technical note`.
- Use one issue per root cause when evidence supports a shared root cause. Do not duplicate an existing Plane ticket; search or list before creating.
- Do not invent missing testcase IDs, environment, account, or expected behavior.

## Prohibited content

- Passwords, API keys, cookies, access tokens, refresh tokens, or service-account JSON
- Emoji or decorative icons
- Vietnamese text without diacritics
- Raw multi-line stack traces
- A title written only as a technical failure such as `GET /api/foo returns 500`

## Priority

- `urgent`: production outage, destructive data loss, or critical security impact
- `high`: primary flow blocked or clearly incorrect result with no practical workaround
- `medium`: secondary flow or edge case with a workaround
- `low`: cosmetic or minor usability issue

Use evidence and user impact. Do not raise priority merely because an HTTP status is `500`.

## Initial state

Every newly logged bug must be created in `Todo`. Do not create a new bug directly in `In Progress`, `Ready to Test`, or `Done`. Resolve the project's state named `Todo` instead of reusing a state UUID from another project.

## Required preflight

1. Run `bash scripts/doctor.sh`.
   When the user supplied a workspace or project URL, run `bash scripts/doctor.sh --url '<URL>'` and use the workspace/project parsed from that URL.
2. Search/list Plane for likely duplicates.
3. Prepare JSON using `bug-template.json`.
4. Run `python3 work-items/log-bug.py <file> --dry-run`.
5. Confirm the title, required fields, priority, project, assignee, evidence paths, and absence of secrets.
6. Create only after the user confirms the external write or explicitly asked to log it.

## Final checklist

- [ ] Title is `[Wxx][Module]` plus a Vietnamese user-visible symptom.
- [ ] OS, Browser, Environment, URL, and a safe Test account are present.
- [ ] Precondition and Steps are numbered lists.
- [ ] Expected and Actual are separate and specific.
- [ ] Evidence exists or is explicitly marked unavailable.
- [ ] Technical details appear only in `Technical note`.
- [ ] No secret or password appears anywhere.
- [ ] No emoji appears anywhere.
- [ ] Initial state is `Todo`.
