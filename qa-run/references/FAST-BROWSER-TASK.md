# Fast browser task profile

`FAST` is the low-friction execution profile inside the public `EXPLORATORY_BROWSER_QA` skill. `BROWSER_TASK_FAST` is the user-facing and backward-compatible label for this profile, not a separate skill or a sibling workflow. Use it when the user gives a URL and a short web task such as opening a page, reading visible information, checking a link, navigating a flow, downloading a non-sensitive file or filling a reversible non-production form

It is not a full QA verdict. Internally it may return `TASK_DONE`, `TASK_FAILED` or `TASK_BLOCKED`; when surfaced as a QA result, normalize these to `PASS`, `FAILED`, `N/A` or `UNTEST`. It must switch from the `FAST` profile to the normal `EXPLORATORY_BROWSER_QA` profile when the user asks to find bugs, verify business rules, compare expected versus actual behavior, perform regression/retest, or provide a release-quality result

## Minimum input

- exact starting URL
- one-sentence task objective
- allowed domain or same-origin boundary
- role, existing auth state and test data when the task needs them

Never infer a missing target URL, account, secret, role or destructive authorization

## Fast execution contract

1. Validate the URL scheme and allowed domain before opening the browser
2. Start `run-manifest.mjs` with `--mode EXPLORATORY_BROWSER_QA --profile FAST`; no business brief or source repository is required for this profile. The compatibility form `--mode BROWSER_TASK_FAST` is normalized to the same canonical route/profile
3. Resolve one browser driver and one same-session observer; prefer the native Playwright runtime when MCP is unavailable
4. Observe the page before the first action and after every navigation, form submission, download, popup or recovery
5. Use a maximum of 8 actions and 120 seconds unless the user explicitly supplies a smaller limit
6. Allow navigation, read, search, scroll, screenshot and reversible UI interactions; block delete, pay, publish, invite, permission changes, external messages, high-volume actions and secret entry by default
7. Capture a start or final screenshot plus redacted URL/title, action summary, console/page errors and same-session network summary
8. Stop when the objective is satisfied, the bounded budget is exhausted, an auth/consent/destructive wall appears, or the target becomes ambiguous

Recovery is limited to two safe attempts and never repeats a mutation. A timeout, empty page or browser health response is not success

## Upgrade rules

Upgrade the run to `EXPLORATORY_BROWSER_QA` when any of these appears:

- a possible defect or unexpected behavior
- a business rule, authorization, uniqueness or side-effect question
- an expected result that needs an oracle
- a request for coverage, evidence-backed PASS/FAILED, retest, regression or bug report
- a write that is not explicitly reversible and authorized

The upgraded profile runs `prepare-test-intelligence.mjs`, creates the business execution card and uses the full observe → plan → act → verify → recover → re-rank ledger
