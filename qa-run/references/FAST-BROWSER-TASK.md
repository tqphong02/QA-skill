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

## One-command native start

When `playwright-runtime` is selected, start the FAST task with one command

```bash
node <skill-root>/scripts/helpers/native-browser-runtime.mjs quick-start \
  [RUN_ID] \
  --url <EXACT_URL> \
  --objective "<ONE_SENTENCE_TASK>" \
  --allowed-domain <ORIGIN>
```

This command validates the URL/domain, creates the FAST manifest and task contract, starts or reuses the native daemon, navigates to the exact URL and returns the first compact visible-content/AX observation packet. Omit `RUN_ID` to generate one. The daemon enforces the allowed origin for explicit and resulting navigation

Keep `--detail compact` unless the packet's `truncation` says the required target or signal may be outside the returned slice. Escalate to `observe --detail standard`, then `full` only when needed. This preserves selector and oracle quality while avoiding full-page controls, tables and AX nodes on every model turn

The returned observation contains compact visible text, headings, links, tables, interactive refs and AX nodes. Use `extract` when the task needs machine-readable visible content

```json
{
  "type": "extract",
  "format": "structured",
  "max_items": 50,
  "max_chars": 8000,
  "capture_media": false
}
```

Use `batch` for at most five read-only actions such as navigate, back, reload, wait, page scroll, switch page/tab, screenshot and extract. The runtime observes after every action in the batch and stops early on a runtime failure. Never batch click, fill, type, check, select, download or another write-like interaction; perform those one at a time after a fresh observation. Use the single `download` action for a visible semantic download target; the runtime saves the attachment under the worker evidence directory and returns its path

Finish and close the FAST session with one command

```bash
node <skill-root>/scripts/helpers/native-browser-runtime.mjs quick-finish \
  <RUN_ID> --verdict <PASS|FAILED|N/A|UNTEST> [--reason "<WHY>"]
```

`PASS` here means the bounded task objective completed. It is not a release-quality QA PASS and does not replace full exploratory charters, hidden-rule probes, coverage or the independent task judge

## Upgrade rules

Upgrade the run to `EXPLORATORY_BROWSER_QA` when any of these appears:

- a possible defect or unexpected behavior
- a business rule, authorization, uniqueness or side-effect question
- an expected result that needs an oracle
- a request for coverage, evidence-backed PASS/FAILED, retest, regression or bug report
- a write that is not explicitly reversible and authorized

The upgraded profile runs `prepare-test-intelligence.mjs`, creates the business execution card and uses the full observe → plan → act → verify → recover → re-rank ledger
