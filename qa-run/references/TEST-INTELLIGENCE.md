# Test intelligence

Use this reference as an optional enrichment layer before exploratory, ad-hoc, sanity, regression, retest, or Sheet browser runs. `EXPLORATORY_ADHOC` is UI-first: when no saved knowledge, source or document exists, the live browser supplies the initial flow and visible oracle. The objective is to turn available knowledge plus UI observation into ranked test missions instead of a generic checklist.

## Source precedence

Resolve facts in this order:

1. Explicit ticket, testcase, requirement, role and expected result
2. Runtime-verified feature knowledge matching the current environment
3. Source-derived API, rule, state, permission, flow and integration artifacts at the current commit
4. Current UI and same-session network observation
5. Clearly labeled inference

Do not silently choose one source when they conflict. Create a high-priority reconciliation charter, preserve both claims with provenance, and let runtime evidence resolve the conflict where safe.

## Canonical preparation

Run from the tested project:

```bash
node <skill-root>/scripts/helpers/prepare-test-intelligence.mjs \
  --intent <EXPLORATORY_BROWSER_QA|EXPLORATORY_ADHOC|SANITY_REGRESSION|RETEST_TICKET|SHEET_TESTCASE_EXECUTION> \
  --scope <feature-slug> \
  --repo <source-repo-if-available> \
  --target <route-if-known> \
  --role <role-if-known> \
  --expected <expected-if-known> \
  --impact <related-areas-if-known>
```

When `--repo` is present, the command refreshes source knowledge only when it is missing, incomplete or behind the current commit. `--refresh-source always` forces refresh; `never` uses saved knowledge only.

The preparation step reuses an unchanged context fingerprint by default. Use
`--no-cache` only after changing a generator, budget policy or retrieval rule;
`--card-max-tokens <N>` changes the bounded model-facing card budget

Read the bounded model-facing card first:

- `qa-knowledge/context/business-execution-card.json`

Keep these as canonical/audit artifacts and open them only for scoped escalation:

- `qa-knowledge/context/business-execution-brief.json`
- `qa-knowledge/context/business-execution-brief.md`
- `qa-knowledge/context/context-budget.json`

The full JSON includes:

- `knowledge_health`: whether facts are runtime-correlated or static/document-derived
- `source_evidence`: fact-to-file/line provenance
- `business_context`: routes, roles, flows, rules, states, side effects, contracts and a compact `business_model`
- `risk_inventory`: ranked hypotheses derived from those facts
- `exploratory_charters`: executable, evidence-aware missions

## Compact business model and invariant retrieval

The builder keeps a small deterministic model beside the verbose audit brief:

```text
business_model = {
  nodes:      domain/module/route/role/state/endpoint candidates,
  relations:  ownership, transition, access and sequence candidates,
  invariants: statements with an executable oracle and provenance
}
```

Use `invariants` before generic UI checks. A source-derived relation is still only a candidate; preserve its confidence and confirm it with runtime. For flows with multiple versions or sessions, use the invariant to compare selected IDs, result count, ID mapping and each result conclusion. Do not treat `status=pass` as sufficient when the result body is empty or unmapped

The model-facing card is intentionally smaller than the canonical brief (default 3,200 deterministic token-estimate units). It retains high risks, high charters, invariant-first facts, observability requirements and retrieval pointers when optional context exists. For UI-first exploratory runs without those artifacts, the runner creates a UI-derived charter and the full brief is not a gate. Cache hits reuse the same fingerprint; rebuild with `--no-cache` only after source, generator or retrieval policy changes

Static code and UI observation are read-only inputs. They can identify routes, permissions, states, side effects and candidate oracles, but they cannot prove persistence, authorization, concurrency or external side effects without same-session runtime evidence. Mark those claims unresolved instead of filling the gap with a generic flow

The card contains the execution contract, high-risk charters, bounded evidence,
source hashes and explicit `retrieval.deferred_*` / `truncation` signals. If a
high-risk oracle is unresolved or evidence conflicts, read only the referenced
full brief/source next. Do not load both card and full projections by default

## Agentic browser execution

For `EXPLORATORY_BROWSER_QA`, `EXPLORATORY_ADHOC` and `APP_BASELINE_DISCOVERY`, read [EXPLORATORY-AGENT-LOOP.md](EXPLORATORY-AGENT-LOOP.md) and start `scripts/helpers/exploratory-runner.mjs` with the same run ID as the manifest. If optional context exists, use the card; otherwise let the runner create a UI-derived charter. If MCP is unavailable, read [NATIVE-BROWSER-RUNTIME.md](NATIVE-BROWSER-RUNTIME.md) and start the first-party native session daemon. Use its observe → plan → act → verify → recover → re-rank loop to let the agent discover and execute a new UI flow without falling back to blind clicking. Keep the charter oracle, same-session observer, safety rule and evidence path attached to every action

Before the first action, create the runner's hidden-rule plan and read [BUSINESS-RULE-DISCOVERY.md](BUSINESS-RULE-DISCOVERY.md). For every applicable risk, choose a safe probe for uniqueness, authorization, side effects and the oracle, then declare the coverage boundary. UI/source facts only nominate hypotheses. Do not mark a backend constraint, permission, persistence effect, expected result or full-flow coverage as `runtime_verified` until the corresponding probe has same-session evidence

## Charter execution

Execute charters by priority, not file order or DOM order. The browser loop may discover a new action, tab, dialog, role, state or dependency, but it must re-rank against the business risk rather than continue a generic page traversal

For each charter:

1. Copy its mission, target, roles, techniques, oracle, safety rule and source references into the run ledger
2. Confirm the required account/data exists
3. Run the shortest happy transition needed to reach the risk
4. Make one purposeful deviation tied to the hypothesis
5. Observe UI, URL, same-session network/console and persisted state
6. Compare against the charter oracle and source claim
7. Run or update the relevant hidden-rule probe and preserve its provenance (`runtime_verified`, `contradicted`, `inconclusive`, `blocked` or `candidate`)
8. Record `confirmed`, `disproved`, `blocked` or `unresolved`
9. Use the result to choose the next charter; do not finish a fixed generic list when evidence points elsewhere

For a short session, execute all high-priority charters first. For longer sessions, expand medium risks, adjacent states, roles and integrations. Never reduce exploratory testing to “click every button”.

## Adaptive reasoning loop

After every meaningful observation:

```text
Observation
  -> Which business claim did it confirm or contradict?
  -> Which risk probability or impact changed?
  -> Is a new state, role, dependency or boundary exposed?
  -> Continue current charter, branch to a higher-risk charter, or stop?
```

Branch when:

- the UI outcome conflicts with API/persisted state
- a role sees an action that source permission data rejects
- a state transition occurs outside the known state model
- retry or duplicate requests create more than one side effect
- a dependency failure leaves partial state
- current runtime contradicts saved knowledge or current source

## Quality gates

- Every exploratory charter must cite at least one business fact or explicit observed UI signal
- Every `high` risk must be executed, blocked with the missing prerequisite, or consciously deferred with a reason
- Static source claims remain `static_or_document_derived` until runtime proves them
- A run may claim `PASS` only inside an explicit coverage boundary; `COMPLETE_FOR_SCOPE` is not proof that the whole application was tested
- Missing expected results, role comparison, before/after read-back or safe duplicate data are explicit gaps, never assumptions
- Runtime facts must identify environment, role/data and evidence
- Generic attack vectors supplement a charter only when they match its feature type and risk
- Do not run destructive, high-volume, security exploit or production mutation scenarios without the required authorization
- Do not conclude PASS from a generated checklist count; conclude only against business oracles and evidence

## Knowledge feedback

After the run:

- promote confirmed source claims to runtime-verified facts
- mark contradicted facts with both source and runtime evidence
- store newly observed state transitions, permissions, API contracts and side effects
- update known issues and reusable assets
- rebuild the intelligence brief on the next run so ranking reflects accumulated knowledge
