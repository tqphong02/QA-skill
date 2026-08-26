# QA Run — Pipeline & Discovery Reference

> Read this file when: running REPO_BUSINESS_DISCOVERY, UI_BUSINESS_RECONCILIATION, or understanding the 15-layer QE pipeline.

## Enterprise QE Pipeline (15 Layers)

```
Intent Router → Test Intelligence (prepare-test-intelligence.mjs: requirement + knowledge + current source)
  → Ranked Risk Charters → Business Context Gate (context-builder.mjs)
  → Manifest Initializer (run-manifest.mjs) → Safety Guard (Default BLOCKED)
  → Knowledge Validator (validate-knowledge.mjs)
  → Worker Account & Data Isolation (data-factory.mjs) → Runtime Observer (runtime-observer.mjs)
  → Executors (Checklist / Mutation / Visual Audit / Visual Regression / UX Journey)
  → Evidence Redaction & Packaging (collect-evidence.mjs) → AI Analyzer & Oracle
  → Result Normalizer → Idempotent Exporters → Cleanup & Orphan Verification → Knowledge Delta Update → Manifest Finalizer
```

## REPO_BUSINESS_DISCOVERY (Static Source Code Analysis Pipeline)

Activated when the user requests: `Analyze this repo`, `Learn business flow from source code`, `Scan system logic`, `Update knowledge from repository`, `Create business guide from code`.

```bash
# Analyze a repo
node scripts/orchestrators/repo-business-discovery.mjs --repo /path/to/backend --mode full --graphify auto

# Only update changes
node scripts/orchestrators/repo-business-discovery.mjs --repo /path/to/backend --mode incremental --graphify auto

# Analyze multiple repos simultaneously
node scripts/orchestrators/repo-business-discovery.mjs --workspace /path/to/project --repos frontend,backend --mode full --graphify auto
```

Incremental mode unions committed, staged, unstaged and untracked paths, selects a conservative change-impact scanner set and fails closed if a scanner or canonical artifact fails. It never skips dirty source merely because `HEAD` is unchanged

Graphify is an optional code-only discovery provider in this orchestrator. Default `--graphify auto` uses it when installed and continues with canonical scanners when unavailable. Use `--graphify required` only when the requested result explicitly depends on Graphify and read [GRAPHIFY-EFFECTIVE-HTML.md](GRAPHIFY-EFFECTIVE-HTML.md) before changing this boundary

Output: `qa-knowledge/repositories/<repo-name>/` includes:
- `repo-metadata.json` — repo type, framework, modules, commit
- `symbol-index.json` — class, function, enum, route, decorator, validation
- `architecture-map.json` — Module → Controller/Service/Repository + integrations
- `api-contracts.json` — endpoint, method, auth, roles
- `business-rules.json` — rule with ruleId, category, condition, failureResult, confidence
- `knowledge-index.json` — entry index for scope load, pointing to flow/rule/contract shards
- `system-overview.md` — compatible summary for human reading
- `flows/`, `rules/`, `contracts/`, `evidence/` — shard knowledge by scope
- `business-guide.md` *(Phase 3, compatibility)* — guide tổng hợp 18 sections khi cần bàn giao hoặc fallback
- `graphify-discovery.json` *(optional)* — complete normalized project graph plus a token-bounded `contextSlice`, preserving `EXTRACTED`, `INFERRED` and `AMBIGUOUS`
- `graphify-code-only/graphify-out/` *(optional)* — isolated raw local Graphify output; never the canonical business truth

When `system-business-guide.md` exists at `qa-knowledge/merged/`, `dynamic-web-exploratory` and `static-requirements-analysis` read from it for enriched context. When the project already has `qa-knowledge/knowledge-index.json`, only load the shards pointed to by the index instead of reading the entire large guide.

## UI_BUSINESS_RECONCILIATION (UI vs Source/Docs/Runtime Reconciliation Pipeline)

Activated when the user requests: `Infer flow from UI`, `Reconcile UI with backend/BRD`, `Find UI vs Source Code conflicts`, `Generate questions for BA/PO/Dev from UI`.

```bash
# Read-only live reconciliation
node scripts/orchestrators/ui-business-reconciliation.mjs \
  --url https://app.example.com/orders/123 \
  --page order-detail \
  --requirements .../../static-requirements-analysis/project_Requirements.json \
  --role Staff

# Deterministic snapshot reconciliation
node scripts/orchestrators/ui-business-reconciliation.mjs \
  --snapshot fixtures/order-detail-components.json \
  --page order-detail \
  --requirements .../../static-requirements-analysis/project_Requirements.json
```

Both browser/snapshot input and the requirement registry are mandatory. The pipeline does not silently substitute demo data. Each observed component receives a stable `uiItemId`, and every UI item and requirement must appear in the traceability result

Runtime verification is a separate state-changing gate. Run it only after authorization for the exact selector:

```bash
node scripts/orchestrators/ui-business-reconciliation.mjs \
  --url https://app.example.com/orders/123 \
  --page order-detail \
  --requirements .../../static-requirements-analysis/project_Requirements.json \
  --verify-runtime \
  --runtime-action-selector '#submit' \
  --runtime-expected-state SUBMITTED
```

Evidence levels are additive: `ui_observed`, `document_supported`, `source_derived`, `runtime_verified`, `human_confirmed`. Never promote UI observation or static source candidates to runtime or human confirmation

Output: `qa-knowledge/ui-business/<page-slug>/` includes:
- `ui-components.json` — Filter components with business meaning & intent
- `observed-flow.json` — UI observed flow & state sequence (DRAFT → SUBMITTED → APPROVED → COMPLETED / CANCELLED)
- `ui-requirement-traceability.json` — Source of truth mapping UI item ↔ requirement ↔ source/runtime with 7 statuses (`MAPPED`, `UI_ONLY`, `REQ_ONLY`, `CONFLICT`, `AMBIGUOUS`, `UNREACHABLE`, `NOT_APPLICABLE`)
- `business-conflicts.json` — Review queue derived from conflict, ambiguity and orphan requirement mappings
- `unresolved-rules.json` — Detect 10 specific ambiguity patterns
- `clarification-qna.json` — Clarification questions for BA, PO, Dev
- `ui-business-guide.md` — Full 12-section Markdown report
