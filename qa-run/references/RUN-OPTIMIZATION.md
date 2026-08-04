# QA run optimization contract

Use this contract for every project that clones the repository. It optimizes preparation and waiting overhead without reducing the required QA layers, oracle strength, same-session observability or evidence rules

## Run modes

Pass `--run-mode` to `scripts/helpers/prepare-test-intelligence.mjs`:

| Mode | Behavior | Quality rule |
|---|---|---|
| `auto` | Reuse valid knowledge; refresh stale source knowledge incrementally; escalate when missing | Default and safe for normal runs |
| `fast` | Prefer stat-fast context cache and the bounded card | If knowledge is stale, escalate instead of silently using a stale oracle; an explicit `--refresh-source never` remains an operator override |
| `scoped` | Keep retrieval and source refresh trace scoped to the feature/module | Scope is a retrieval optimization; ambiguous source impact still escalates to discovery |
| `deep` | Force a full source discovery and rebuild | Use after generator, branch, architecture or requirement changes |

`FAST` and `SCOPED` change preparation cost only. They do not remove RETEST_PLUS, SHEET_EXECUTION_PLUS, high-risk charters, browser observability or evidence requirements

## Cache contract

`context-builder.mjs` stores a short metadata inventory fingerprint with the canonical brief. When paths, sizes, timestamps and invocation inputs are unchanged, it reuses the existing content hashes and card without rereading every artifact. Any inventory change falls back to content hashing. Use `--no-cache` after changing retrieval or generator policy

The cache is project-local under `QA_DATA_DIR/qa-knowledge`; it never writes into the cloned skill directory and contains no provider-specific credentials

## Discovery parallelism

`repo-business-discovery.mjs` accepts `--parallel auto|on|off` and defaults to `auto`. Independent Phase 1 and Phase 2 scanners run concurrently. Phase 3 keeps reconciliation as a barrier, then runs independent derived reports concurrently. In `incremental`, the orchestrator unions committed, staged, unstaged and untracked paths, applies a conservative impact plan, and reuses only a complete baseline artifact set. UI-only, API-only, database-only, RBAC-only and test-only deltas can avoid unrelated scanners; ambiguous/config/documentation deltas escalate to the full scanner set. Use `--parallel off` only for diagnosing a tool or resource conflict. `discovery-session.json` records phase timings, selected tasks, changed paths and reused artifacts

Every selected scanner is behind a fail-closed gate. A non-zero exit or missing canonical artifact aborts discovery before the old knowledge can be treated as current. A dirty working tree is never skipped merely because `HEAD` is unchanged

## Adaptive browser readiness

Shared `lib/wait.mjs` tracks document/XHR/fetch/preflight lifecycles in the same page session and waits for a short quiet window. WebSocket/EventSource connections are not used as a readiness blocker. Configure bounded behavior with:

- `QA_READY_TIMEOUT_MS`
- `QA_READY_QUIET_MS`
- `QA_READY_POLL_MS`
- `QA_LEGACY_SETTLE_MS` or an explicit helper `--wait` when an application has a known animation quirk

Timeout is an observation result, not a PASS. Continue collecting UI, network, console, page-error and persistence evidence. A long-lived request must not be hidden by changing the timeout; record it as a runtime signal when relevant

## Reasoning and model routing

Use the execution card as the default context surface. A fast/deterministic model may classify, select scoped facts and format evidence. Escalate to a stronger model or a full-brief read only when a high/critical oracle is unresolved, sources conflict, a new state/role/dependency appears, or runtime contradicts the card. Never route an ambiguous or missing oracle to an automatic PASS

## Compact-first browser context

Use progressive disclosure for model-facing runtime packets

1. Start native `observe` with `detail=compact`: at most 32 controls, 2,200 visible-text characters, bounded links/tables and 20 AX nodes; locator internals remain in the native session for target resolution
2. Read `truncation` and `context_budget` in the packet. Continue compact when the current target and expected signal are present
3. Escalate once to `detail=standard` only when truncation hides a required target/oracle or resolution is ambiguous; use `detail=full` only after standard is insufficient
4. Use targeted `extract` for a specific table/container instead of broadening every observation
5. Call `exploratory-runner.mjs agent-context <RUN_ID>` for the current step, compact memory, last state delta, pending probes and evidence counts; do not reload the full run JSON before every decision

Compaction changes representation, not QA quality. Every action still re-observes the live page, same-session network/console/page-error correlation remains mandatory, screenshots stay file-backed evidence, and missing signals escalate or end as `UNTEST` rather than becoming `PASS`

Keep decision context concise: one current goal, one action, up to two alternatives, four new memory facts and eight deduplicated carry-forward facts. Full traces, locator attempts and media remain in evidence artifacts and are retrieved only for failure diagnosis or final reconciliation

Measure optimization with run ID, cache mode, preparation duration, browser duration, observation profile/token estimate, escalation count, risk coverage, evidence completeness, blocked count and false-PASS/reopened-defect rate. The bounded card and native packet expose separate deterministic UTF-8/4 estimates; when the host reports real usage, write a redacted JSON file through `record-model-usage.mjs` and set `QA_TOKEN_USAGE_FILE`. `context-budget.json` and the run manifest then preserve provider, model, input/output/total tokens, latency and cost separately from the estimates

Measure business-flow intelligence with `scripts/helpers/evaluate-business-intelligence.mjs` and a project-owned golden dataset. Its precision/recall is a retrieval coverage signal, not semantic proof; runtime evidence and reviewer confirmation remain required

Antigravity is not considered live-tested by documentation alone. Run the actual host smoke, capture same-session screenshot/network/console/page-error evidence, and pass it through `scripts/helpers/validate-host-smoke.mjs`; missing evidence is `BLOCKED`
