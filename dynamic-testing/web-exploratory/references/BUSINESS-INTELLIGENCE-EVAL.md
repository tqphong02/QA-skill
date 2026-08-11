# Business intelligence evaluation

Use a project-owned golden JSON with stable expected routes, roles, preconditions, flow steps, rules, expected results and invariants. Evaluate the generated brief without sending the full repository to a model:

```bash
node scripts/helpers/evaluate-business-intelligence.mjs \
  --brief <project>/qa-knowledge/context/business-execution-brief.json \
  --golden <project>/qa-knowledge/golden/<feature>.json \
  --output <project>/evidence/intelligence-evaluation.json
```

The report measures deterministic precision/recall and returns `PASS` only when the brief is `READY`, required facts are present and thresholds are met. Matching is a retrieval/coverage signal, not proof that the business meaning is correct; keep runtime evidence and reviewer approval as the semantic oracle

For cross-project comparison, keep the same golden schema and record `project`, `commit`, `run_id`, `model`, `provider`, `cache_mode`, `estimated_tokens` and `provider_token_usage` beside each report. Do not compare raw test counts as intelligence quality
