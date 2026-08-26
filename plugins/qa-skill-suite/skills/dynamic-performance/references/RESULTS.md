# Common performance results

Both engines normalize into `result.json` using
[schemas/result.schema.json](../schemas/result.schema.json).

## Verdict

PASS requires every configured threshold to pass:

- p95 response time is at or below `p95Ms`
- p99 response time is at or below `p99Ms`
- error rate is at or below `maxErrorRate`
- throughput is at or above `minRequestsPerSecond` when configured

A non-zero engine exit caused only by threshold failure does not replace
normalization; parse the raw result and report the exact failed threshold.

## Reports

- `result.json`: machine-readable CI input
- `summary.md`: Jira, Plane or GitHub handoff
- `summary.html`: human executive report
- `engine-report/`: native JMeter dashboard or k6 dashboard
- `raw/`: JTL or k6 summary export
- `logs/`: redacted stdout/stderr

Slow endpoint rankings require native label or endpoint-tag submetrics. If they
are absent, report the limitation rather than inventing endpoint attribution.

Call a bottleneck `suspected` until latency/error changes correlate with server,
database, queue, network, cache or downstream evidence and a control comparison.

Compare compatible normalized runs with:

```bash
python3 scripts/performance_orchestrator.py compare \
  --baseline artifacts/baseline/result.json \
  --candidate artifacts/candidate/result.json \
  --output-dir artifacts/comparison
```

The comparison returns `NOT_COMPARABLE` when environment, test type or workload
model differs; disclose and resolve those differences before claiming a regression.
