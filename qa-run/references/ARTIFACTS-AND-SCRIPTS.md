# Artifact and script routing

Read this reference only when locating artifacts, diagnosing a helper or extending `qa-run`. Normal browser execution should use the route-specific canonical commands without loading a full script catalog

## Project-local artifacts

All runtime data belongs under the tested project (`cwd` or `QA_DATA_DIR`), never the skill folder

```text
<project>/
├── .env, auth.json
├── evidence/
│   ├── exploratory/<run-id>/
│   ├── runs/<run-id>/
│   ├── native-browser/<run-id>/worker-<id>/
│   ├── network/<run-id>/, console/<run-id>/
│   └── sheet/<group>/<date>/<run-id>/worker-<id>/
├── qa-knowledge/
│   ├── knowledge-index.json
│   ├── context/business-execution-brief.json
│   ├── context/business-execution-card.json
│   ├── context/context-budget.json
│   ├── flows/, rules/, contracts/, evidence/
│   └── repositories/, ui-business/
├── FINDINGS.md
└── reports/
```

Media, traces and runtime details remain file-backed. Put only compact redacted summaries and relative evidence pointers into model context

## Script routing

Use `scripts/registry.mjs` as the source of truth for script names and paths. The main groups are:

- `helpers/`: manifests, browser runtime/observer, exploratory ledger, context preparation, Sheet execution, evidence and waits
- `discovery/`: source index, flows, rules, contracts, state, architecture and Graphify adapter
- `orchestrators/`: repository discovery and UI/business reconciliation
- `analysis/`: attack-surface and finding reconciliation
- `rbac/`: permission extraction/testing
- `ui-reconciliation/`: UI component/state/ambiguity/runtime evidence
- `writers/`: business guides, reports, traceability and companion HTML

Prefer the command named by the selected route. Inspect only its registry entry and direct implementation when diagnosis or modification is required
