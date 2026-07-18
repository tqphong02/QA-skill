# QA reports on Drive

## Reading

- Read the exact source file before summarizing.
- Preserve report date, scope, status categories, totals, testcase IDs, Plane references, blockers, and evidence links.
- Validate arithmetic but do not silently correct it. Report mismatches as format/data gaps.
- Do not convert a bug report into a daily report or a daily report into a bug-ticket template.

## Uploading

- Verify the local artifact exists and is the final intended version.
- Confirm the destination folder ID and target filename.
- Upload a new file by default. Do not replace a same-named Drive file without explicit approval.
- Return the uploaded file name, ID, and view link.

## Secrets

Before upload, check that the report does not include passwords, API keys, cookies, OAuth tokens, service-account JSON, or private `.env` contents.
