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
node scripts/repo-business-discovery.mjs --repo /path/to/backend --mode full

# Only update changes
node scripts/repo-business-discovery.mjs --repo /path/to/backend --mode incremental

# Analyze multiple repos simultaneously
node scripts/repo-business-discovery.mjs --workspace /path/to/project --repos frontend,backend --mode full
```

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

When `system-business-guide.md` exists at `qa-knowledge/merged/`, `qa-run` and `business-analysis` read from it for enriched context. When the project already has `qa-knowledge/knowledge-index.json`, only load the shards pointed to by the index instead of reading the entire large guide.

## UI_BUSINESS_RECONCILIATION (UI vs Source/Docs/Runtime Reconciliation Pipeline)

Activated when the user requests: `Infer flow from UI`, `Reconcile UI with backend/BRD`, `Find UI vs Source Code conflicts`, `Generate questions for BA/PO/Dev from UI`.

```bash
# Scan a live page or snapshot and run the 7-step pipeline:
node scripts/ui-business-reconciliation.mjs --page order-detail
node scripts/ui-business-reconciliation.mjs --url https://app.example.com/orders/123 --page order-detail
```

5-tier reconciliation source priority: **Runtime Verified → Source Code & API → BRD/SRS Docs → UI Observed → AI Inference**.

Output: `qa-knowledge/ui-business/<page-slug>/` includes:
- `ui-components.json` — Filter components with business meaning & intent
- `observed-flow.json` — UI observed flow & state sequence (DRAFT → SUBMITTED → APPROVED → COMPLETED / CANCELLED)
- `business-conflicts.json` — Report classifying 9 results (`MATCHED`, `UI_ONLY`, `DOC_ONLY`, `CODE_ONLY`, `CONFLICT`, `AMBIGUOUS`, `UNREACHABLE`, `MISSING_TRANSITION`, `PERMISSION_CONFLICT`)
- `unresolved-rules.json` — Detect 10 specific ambiguity patterns
- `clarification-qna.json` — Clarification questions for BA, PO, Dev
- `ui-business-guide.md` — Full 12-section Markdown report
