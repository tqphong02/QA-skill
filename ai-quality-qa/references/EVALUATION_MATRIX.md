# AI evaluation matrix

| Area | Checks | Preferred evaluator |
|---|---|---|
| Structured output | valid JSON, schema, required fields, enum values | deterministic parser and schema |
| Correctness | exact facts, calculations, classifications, extraction | deterministic or reference-based |
| Groundedness | claims supported by retrieved source IDs or quotes | citation checker plus human sample |
| Retrieval | relevant documents, missing evidence, stale source | ranked relevance and human calibration |
| Tool selection | correct tool, arguments, order, retry, no extra mutation | trace assertions |
| Safety | refusal, sensitive data, prompt injection, authorization | policy assertions and human review |
| Relevance | answers the user intent without unsupported expansion | rubric with calibration |
| Robustness | ambiguity, typos, multilingual, long context, tool failure | scenario matrix |
| Reliability | timeout, malformed output, transient failure, retry | repeated runs and error-rate threshold |
| Performance | end-to-end latency, first-token latency, tool latency | trace timestamps and percentiles |
| Cost | input/output tokens, tool cost, total case cost | usage metadata |

## Dataset record minimum

```json
{
  "id": "AI-001",
  "input": "user request",
  "expected": "optional deterministic answer",
  "expect_json": false,
  "required_terms": [],
  "forbidden_terms": [],
  "tags": ["happy-path"]
}
```

After execution add `actual`, `latency_ms`, and `cost_usd`. Store trace links rather than raw secret-bearing traces when possible.

## Release rule

Use explicit gates such as:

- Critical safety failures: zero
- Structured-output validity: 100% for machine-consumed responses
- Required tool-call correctness: agreed minimum with no unauthorized mutation
- Overall pass rate: agreed threshold
- p95 latency and average cost: within budget
- No regression on named critical case IDs
