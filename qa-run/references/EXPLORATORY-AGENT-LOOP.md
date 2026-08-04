# Exploratory/ad-hoc agent loop

Use this reference for `EXPLORATORY_BROWSER_QA` (`EXPLORATORY_ADHOC` is the legacy alias) and `APP_BASELINE_DISCOVERY`. `RETEST_PLUS` and `SHEET_EXECUTION_PLUS` reuse this loop as one layer; do not run a second generic exploration for them

The loop adds autonomous browser control to `qa-run` through the first-party native Playwright/CDP runtime while keeping QA intent, UI-derived or business oracles, same-session observability, evidence and verdict gates. Optional `TEST_INTELLIGENCE` and saved business context enrich the run but are not prerequisites for `EXPLORATORY_ADHOC`

When the objective is natural-language or its browser path is not deterministic, read [AGENTIC-TASK-PLANNING.md](AGENTIC-TASK-PLANNING.md). Use its live-state task decomposition, compact memory, previous-goal evaluation, next-goal selection and bounded replan contract before choosing browser actions

## Non-negotiable contract

- Validate the target URL/domain and objective before browser action; run `prepare-test-intelligence.mjs` only when optional source, requirements or saved knowledge is available
- When those artifacts are absent, create a UI-first charter from the live page and derive the flow from visible navigation, controls, states, validation and feedback
- Keep one browser driver, one browser context/session, one network observer and one console/page-error observer for the complete charter; a session may contain multiple verified tabs/pages
- Treat the visible UI transition and same-session runtime evidence as the oracle for UI-scoped claims; a page that merely looks finished is not a PASS
- Use a bounded action budget, a stop condition and a ledger row for every charter and meaningful action
- Do not mutate production data, delete, pay, send, publish, invite, change permissions or trigger high-volume actions without the required authorization
- Stop at password, MFA, consent, ambiguous account or unexpected destructive confirmation unless the user has explicitly authorized the exact action
- Do not install, import, invoke or assume the `browser-use` repository is available. Apply this loop through the resolved `playwright-mcp`, `chrome-devtools-mcp`, bundled `playwright-runtime`, `ego-browser` or approved fallback driver
- Read [BUSINESS-RULE-DISCOVERY.md](BUSINESS-RULE-DISCOVERY.md) and declare the hidden-rule probes before the first meaningful browser action

## Runtime enforcement

The loop is enforced by `scripts/helpers/exploratory-runner.mjs` and stored under the tested project's `evidence/`, not inside the skill folder. It is a companion to `run-manifest.mjs`: use the same `RUN_ID`, start it after the target/domain gate, and finish it before finalizing the run manifest

Start one runner for each exploratory session with resolved driver values:

```bash
node <skill-root>/scripts/helpers/exploratory-runner.mjs start \
  --run-id <RUN_ID> \
  --mode EXPLORATORY_BROWSER_QA \
  --scope <feature-slug> \
  --business-context <optional-project-context-json> \
  --browser-driver <resolved-driver> \
  --browser-observer <resolved-observer> \
  --network-observer <resolved-network-observer> \
  --session-id <same-session-id>
```

Default runtime limits are `40` actions per run, `300000` milliseconds, `16` actions per charter and `1` automatic retry per action. Override with `--max-actions`, `--max-ms`, `--max-actions-per-charter`, `--max-retries-per-action` or the matching `QA_EXPLORATORY_*` environment variables. A budget stop is user-facing `UNTEST`, never a clean `PASS`

Use the runner commands as the ledger boundary:

1. `rule-plan <RUN_ID> --rule-plan-file <JSON>` before the first browser action; include scope boundary, applicable probes, hypotheses, safe strategies and a reason plus provenance basis for every not-applicable probe
2. `page <RUN_ID> --page-file <JSON>` for the initial page and every new tab/page, reusing the same `session_id`
3. `task-plan <RUN_ID> --task-plan-file <JSON>` after the first live observation for a natural-language/non-deterministic objective; decompose the objective into observable bounded goals
4. `agent-context <RUN_ID>` before each model decision; combine this bounded packet with the latest compact browser observation instead of loading the full run ledger
5. `decision <RUN_ID> --decision-file <JSON>` before each autonomous action; evaluate the previous goal, update compact memory, choose one next goal/action and record a concise rationale
6. `action <RUN_ID> --action-file <JSON>` after each meaningful action and its verification; link `decision_id` when agentic planning is active and include intent, semantic target, locator evidence, expected/actual signal, deterministic state delta, safety, observability, evidence and next decision
7. `task-judge <RUN_ID> --judge-file <JSON>` after agentic `COMPLETE`; independently reconcile every declared success signal with evidence
8. `rule-probe <RUN_ID> --probe-file <JSON>` after a uniqueness, authorization, side-effect, oracle or coverage hypothesis has enough same-session evidence; keep unproven claims as `CANDIDATE`, `INCONCLUSIVE` or `BLOCKED` internally
9. `coverage <RUN_ID> --coverage-file <JSON>` after traversing the declared scope; record modules, routes, roles, states, transitions, data classes and dependencies, including explicit gaps/exclusions
10. `charter <RUN_ID> --charter-file <JSON>` after deciding each charter
11. `finish <RUN_ID> --verdict PASS|FAILED|N/A|UNTEST --reason <text when needed>` before `run-manifest.mjs finish`

The runner rejects browser actions before a rule plan, cross-session pages, unverified selectors, XPath without a reason, coordinate actions without bounding-box plus media evidence, destructive actions that are not internally marked `BLOCKED`, mutation retries, missing high-priority charter verdicts and `PASS` without screenshot/video evidence. Agentic `PASS` additionally requires an independent `SATISFIED` task judge with evidence for every success signal. `PASS` also requires runtime-verified coverage that is `COMPLETE_FOR_SCOPE`, type-specific evidence for applicable hidden-rule probes, an explicit session ID, resolved driver/observer/network tracks and no retry-derived `RECOVERED`/`FLAKY` quality flag. A technical blocker or incomplete scope is exposed as `UNTEST` at the final result boundary

The run JSON keeps only redacted summaries and evidence pointers. Native `observe` defaults to the compact profile and exposes `truncation` plus a UTF-8/4 context estimate. Escalate to standard/full only when the current target or oracle is missing. Provider-reported token usage is read from `QA_TOKEN_USAGE_FILE`; the card/native estimates and provider measurement remain separate

## Hidden business-rule protocol

The agent must actively probe the rule classes when they are applicable, rather than infer them from a button, a disabled field or a successful page transition:

- `uniqueness`: two isolated attempts with the same unique candidate, then compare response, validation and read-back
- `authorization`: the same target and operation under a subject role and a comparison role; a hidden UI control alone is not proof
- `side_effect`: redacted before/after snapshots, related-record/read-back checks and same-session request correlation
- `oracle`: explicit expected signal, actual signal and the provenance basis used to decide them
- `coverage`: an explicit boundary and result for modules, routes, roles, states, transitions, data classes and dependencies

Source code, requirements and UI observations select the probe and provide candidate expectations. Only runtime evidence can produce `runtime_verified`; an unavailable safe boundary or ambiguous expected result remains `INCONCLUSIVE` internally and becomes `UNTEST` at the final result boundary. Read [BUSINESS-RULE-DISCOVERY.md](BUSINESS-RULE-DISCOVERY.md) for payload rules, evidence requirements and the distinction between `COMPLETE_FOR_SCOPE` and full-system coverage

## Session state

Maintain a compact state object and refresh it after every meaningful observation:

```text
route, charterId, url, tab, frame, role, dataNamespace
pageState = loading | ready | dialog | auth_wall | error | stale | unknown
lastAction, lastExpectedSignal, lastObservedDelta
openRisks, unresolvedClaims, evidencePaths, actionCount, deadline
```

Do not copy raw DOM, credentials, cookies, tokens or unrestricted response bodies into the state. Keep short redacted summaries and pointers to evidence files

## Observe → plan → act → verify → recover → re-rank

Repeat the following loop until the charter is decided or a stop condition is reached

For agentic tasks, persist the task plan, per-step decision, deterministic state delta and independent completion judge through [AGENTIC-TASK-PLANNING.md](AGENTIC-TASK-PLANNING.md). The runner stores compact rationale and memory only; never persist raw chain-of-thought

### 1. Observe

Before choosing an action, inspect the smallest useful scope:

- Confirm the real tab/page, URL, title, role and starting state
- Wait for bounded document/XHR/fetch quiet or an explicit business signal; never treat a timeout as success
- Detect loading overlays, disabled controls, dialogs, alerts, auth walls, stale tabs, iframe/shadow roots, downloads and new tabs
- Prefer the accessibility tree/semantic roles and a scoped DOM snapshot; use a screenshot when layout, visual state or coordinate recovery matters
- Record the current UI delta, matching network events, console errors/warnings and page exceptions in the same session

### 2. Plan one purposeful action

Choose exactly one next action using this priority order:

1. Reach the target transition required by the active high-risk charter
2. Discriminate between competing business hypotheses or source/runtime claims
3. Verify the expected state, API contract, persistence or side effect of the last action
4. Probe a newly exposed state, role, boundary, dependency or integration
5. Perform a scoped UI/UX or accessibility probe that is relevant to the feature
6. Enumerate another control only when the active charter has no higher-value action

The action plan must state `intent`, `semantic target`, `input`, `expected signal`, `safety rule` and `evidence to collect`. Prefer the action with the highest risk reduction and lowest irreversible side effect. Do not use DOM order or random clicking as priority

### 3. Resolve the target

Resolve a semantic target against the current page before acting. Verify uniqueness, visibility, enabled/actionable state and the correct frame or dialog

For exploratory interaction, use this resolution ladder:

1. Accessibility role/name or semantic target from the charter
2. Existing `data-testid`/`data-test-id` verified in the live DOM or FE source
3. Existing `id` verified as unique
4. Stable CSS or role/label/placeholder/text within a scoped container
5. DOM/JS inspection for custom widgets, shadow DOM or canvas
6. Coordinate action only as a last-resort exploratory fallback, with screenshot and bounding-box evidence

Never invent a test id, silently choose a nearby element or turn a coordinate into a reusable selector. XPath is the final locator fallback and requires a recorded reason. When the target is ambiguous, re-snapshot the relevant scope or mark the charter `UNTEST`/`UNRESOLVED`; do not guess

If a locator will later be promoted to POM automation, preserve the verified priority `data-testid → id → stable CSS → role/label/placeholder/text → XPath`, the exact DOM evidence and the reason higher-priority options were unavailable. Route script generation to `playwright-pom-automation`

### 4. Act safely

- Perform one action at a time and capture the pre-action state for critical transitions
- Use native browser interaction where possible; use JS only for inspection or controls that cannot be reached through the normal interaction surface
- Before submit/save/delete/approve/send/upload/payment/permission changes, confirm the charter safety rule and expected side effect
- For invalid, boundary or duplicate data, use isolated test data and namespace it per run/worker
- Do not retry a side-effecting action blindly. First inspect whether the request was sent, whether state changed and whether idempotency is proven
- For navigation, new tabs and downloads, bind the expected page/request/file to the same session before continuing

### 5. Verify the transition

After every critical action, verify at least the relevant sources below:

- UI state delta: text, status, row count, selected version, enabled state, toast/dialog or route
- URL/navigation and page readiness
- Same-session XHR/fetch/document request, status and contract-relevant redacted body
- Console error/warning and page exception correlation
- Persistence or side effect after reload, revisit or safe read-back when the charter requires it
- Final screenshot or video for the charter verdict; preserve the exact evidence path

Classify the technical action as `confirmed`, `disproved`, `blocked` or `unresolved`; map the final user-facing charter/run result only to `PASS`, `FAILED`, `N/A` or `UNTEST`. A missing response, missing final state or unexplained timeout is not a PASS

### 6. Recover without losing evidence

Use bounded recovery, then re-observe instead of repeating the same action blindly:

| Symptom | Recovery | Stop condition |
|---|---|---|
| Stale page/tab or detached target | Confirm real tab, refresh/re-snapshot only when safe, re-resolve target | Two stale recoveries or lost business state |
| Loading never settles | Inspect matching request/console/page error and capture evidence | Bounded timeout; classify `UNTEST` or `FAILED` |
| Dialog/alert blocks action | Read role/name/message, handle only if charter allows, capture before/after | Unexpected destructive or consent dialog |
| iframe/shadow/custom widget | Resolve correct frame/root and inspect semantic/DOM state | Target remains ambiguous |
| Request failed or response conflicts with UI | Correlate request, body, console and visible result; branch to failure charter | Missing observer or unsafe retry |
| Login/MFA/permission wall | Reuse authorized SSO state when unambiguous | Ask user; never guess credentials or account |
| Upload/download/new tab mismatch | Bind file/page/request to the same session and verify name/content | Wrong target or missing artifact |

At most one automatic retry is allowed for a safe, non-mutating action. Every retry must keep first-attempt evidence and be classified as `recovered`, `flaky` or `failed`; retry-pass is never a clean PASS by itself

### 7. Re-rank and branch

After each observation answer:

```text
Which business claim changed?
Which risk became higher, lower, confirmed or disproved?
Did a new role, state, boundary, dependency or side effect appear?
What is the next smallest action that separates the remaining hypotheses?
```

Branch immediately when UI and API/persistence disagree, a role can perform a source-disallowed action, a state transition is unknown, a retry creates duplicate side effects, a dependency leaves partial state or saved knowledge conflicts with runtime

Do not branch for noise that does not change the risk model. Do not continue clicking after all high-risk charters are decided merely to increase the action count

## Charter ledger row

For every meaningful action, keep a compact row with:

```text
charterId, stepId, intent, observation, semanticTarget, locatorEvidence
action, expectedSignal, actualSignal, networkRefs, console/pageErrorRefs
mediaRefs, safetyDecision, verdict, nextDecision
```

The row is an audit pointer, not a raw transcript. Redact secrets and personal data. Link to full traces, screenshots, videos and sanitized network evidence instead of embedding them in the model context

## Stop and finish

Stop the exploratory session when one of these is true:

- Every high-priority charter has `PASS`, `FAILED`, `N/A` or `UNTEST` with an exact reason when it was not executed successfully
- The active hypothesis is confirmed/disproved and no adjacent risk has higher value
- The action/time/evidence budget is exhausted
- A missing role, account, data, authority, observer or oracle makes safe continuation impossible
- A destructive boundary requires user approval

Finish by reconciling findings, evidence completeness, risk coverage and knowledge updates. Promote only runtime-confirmed claims; preserve `static_or_document_derived`, `inferred`, `ambiguous` and `unresolved` provenance

## Browser mechanics reference

Read [NATIVE-BROWSER-RUNTIME.md](NATIVE-BROWSER-RUNTIME.md) when the native runtime is selected. It supplies live AX/CDP observation, the `data-testid → id → CSS → AX/label/text → DOM → XPath` resolution order, daemon session reuse, bounded recovery and isolated workers. Read [BROWSER-OBSERVABILITY.md](BROWSER-OBSERVABILITY.md) for same-session network/console/page-error correlation and [MCP-CHEATSHEET.md](MCP-CHEATSHEET.md) for driver-specific actions. Read [ATTACK-TAXONOMY.md](ATTACK-TAXONOMY.md) only when the active charter supports the relevant form, auth, CRUD, file, concurrency or integration technique
