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

`repo-business-discovery.mjs` accepts `--parallel auto|on|off` and defaults to `auto`. Independent Phase 1 and Phase 2 scanners run concurrently. Phase 3 keeps reconciliation as a barrier, then runs independent derived reports concurrently. Use `--parallel off` only for diagnosing a tool or resource conflict. `discovery-session.json` records phase and script timings

## Adaptive browser readiness

Shared `lib/wait.mjs` tracks document/XHR/fetch/preflight lifecycles in the same page session and waits for a short quiet window. WebSocket/EventSource connections are not used as a readiness blocker. Configure bounded behavior with:

- `QA_READY_TIMEOUT_MS`
- `QA_READY_QUIET_MS`
- `QA_READY_POLL_MS`
- `QA_LEGACY_SETTLE_MS` or an explicit helper `--wait` when an application has a known animation quirk

Timeout is an observation result, not a PASS. Continue collecting UI, network, console, page-error and persistence evidence. A long-lived request must not be hidden by changing the timeout; record it as a runtime signal when relevant

## Reasoning and model routing

Use the execution card as the default context surface. A fast/deterministic model may classify, select scoped facts and format evidence. Escalate to a stronger model or a full-brief read only when a high/critical oracle is unresolved, sources conflict, a new state/role/dependency appears, or runtime contradicts the card. Never route an ambiguous or missing oracle to an automatic PASS

Measure optimization with run ID, cache mode, preparation duration, browser duration, risk coverage, evidence completeness, blocked count and false-PASS/reopened-defect rate. Token estimates remain UTF-8 byte estimates unless the host provides provider tokenizer telemetry
