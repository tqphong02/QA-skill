---
name: integration-observability
description: Connect to Prometheus, Grafana, Elasticsearch, and Kibana through MCP or their REST APIs for health checks, metrics analysis, log analysis, QA reports, dashboards, and alerts. Use for observability, PromQL, metrics, logs, Kibana, Grafana, Prometheus, Elasticsearch, latency, error rate, or service health requests.
mode: integration
surface: observability
role: connector
legacy_aliases: []
---

# Observability Integration

Use this skill to turn telemetry into QA evidence. Prefer an already-configured
MCP server when the host exposes one. Use the bundled REST fallback only when
MCP is unavailable or does not provide the required read operation.

## Supported systems

- **Prometheus**: metrics through `/api/v1/query` and `/api/v1/query_range`
- **Grafana**: dashboards, data sources, and alert rules through Grafana MCP or
  the Grafana HTTP API
- **Elasticsearch**: logs and documents through the Elasticsearch REST API
- **Kibana**: saved objects and alerting through Kibana MCP/API when required

Grafana's MCP server uses `GRAFANA_URL` and
`GRAFANA_SERVICE_ACCOUNT_TOKEN`. Elastic's older standalone Elasticsearch MCP
server is deprecated in favor of the Elastic Agent Builder MCP endpoint for
Elastic 9.2+ and Serverless. Do not assume either MCP is configured merely
because this skill is installed.

## Hard gates

1. Resolve the exact target URL, tenant, index/data source, time range, and
   requested operation before querying.
2. Run the doctor before the first live operation:

   ```text
   node integration/observability/scripts/doctor.mjs
   ```

3. Keep credentials in environment variables or the host MCP login. Never put
   tokens, cookies, passwords, or full Authorization headers in the repository,
   prompts, reports, or command arguments.
   The ignored `integration/observability/.env.local` file is the convenient
   local option: replace only `PASTE_YOUR_ELASTIC_API_KEY_HERE` with your key.
4. Default to read-only. A dashboard, alert rule, saved object, or data
   mutation requires an explicit confirmation immediately before the write,
   followed by read-back verification.
5. Redact secrets and high-cardinality or personal log fields before writing
   evidence to `qa-runs/`.
6. Report `mcp_not_configured`, `mcp_not_loaded`, `auth_required`,
   `runtime_missing`, `permission_denied`, and `target_unreachable` separately.
   Never convert an unavailable source into a passing health result.

## Environment variables for REST fallback

```text
PROMETHEUS_URL=https://prometheus.example
GRAFANA_URL=https://grafana.example
GRAFANA_SERVICE_ACCOUNT_TOKEN=...
ELASTICSEARCH_URL=https://elasticsearch.example
ELASTICSEARCH_API_KEY=...
KIBANA_URL=https://kibana.example
KIBANA_API_KEY=...
```

Only configure the variables needed by the requested source. The doctor checks
reachability and authentication without printing secret values.

## Read-only workflows

### Trace a production error to the codebase

Use this workflow for QA/QC requests such as “truy log lỗi nằm ở đâu trong
codebase” or “đối chiếu lỗi Kibana với source”. This is a read-only
correlation workflow, not a performance test.

1. Resolve the exact environment, service, time window, index, and repository
   branch or commit.
2. Query the log source using the request ID, trace ID, exact error text, or
   timestamp. Prefer a stack trace over a screenshot.
3. Extract the exception type, message, stack frames, service version, commit
   SHA, endpoint, and correlation IDs. Redact tokens and personal data.
4. Match stack frames to the checked-out source. Verify the file path, function
   or method, and line against the recorded commit, not merely the current
   working tree.
5. Read the surrounding implementation and callers. Distinguish:
   - `CONFIRMED`: stack frame and source commit match
   - `LIKELY`: error and call path match, but the deployed commit is unknown
   - `CANDIDATE`: only message, metric, or naming similarity matches
   - `UNTEST`: required log, source, or version evidence is missing
6. Report the exact evidence chain: log event, query, commit, file, symbol,
   line, root-cause reasoning, and a suggested regression test. Never claim a
   source location from a metric alone.

### Health check

1. Run the doctor.
2. For Prometheus, query `up` and inspect the returned series.
3. For Elasticsearch, search the exact index and time range with a bounded
   result size.
4. Correlate service, instance, environment, and request identifiers.
5. Return the source, query, time range, result count, and explicit status.

### Metrics analysis

Use PromQL rather than scraping rendered Grafana panels. Common examples:

```promql
sum(rate(http_requests_total[5m]))
sum(rate(http_requests_total{status=~"5.."}[5m]))
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
```

Use `query_range` for trends and state the step and time window. Do not claim a
performance verdict without a defined threshold or comparison baseline.

### Log analysis

Use Elasticsearch DSL through MCP/API. Bound the time range, index pattern,
size, and fields. Group by error type, service, endpoint, and request ID.
Kibana is the visualization layer; it is not a substitute for reading the
underlying query response.

### QA report

Create a fresh run directory with the repository `qa-runs.mjs` helper. Store
the raw response only after redaction, plus a concise `report.md` containing:
target, time range, queries, observations, threshold/baseline, evidence paths,
and `PASS`, `FAILED`, `N/A`, or `UNTEST`. Missing telemetry or missing
thresholds is `UNTEST`, not `PASS`.

## REST fallback examples

```text
node integration/observability/scripts/query.mjs prometheus \
  --expr "up" --time-range 30m

node integration/observability/scripts/query.mjs elasticsearch \
  --body '{"query":{"match":{"log.level":"error"}},"size":20}'
```

When `ELASTICSEARCH_INDEX` is configured, `--index` is optional.

The fallback is intentionally read-only. Use an MCP write tool or the
documented provider API only after recording the target, operation, required
inputs, write action, and verification.

## Official references

- [Prometheus HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/)
- [Grafana MCP server](https://github.com/grafana/mcp-grafana)
- [Grafana HTTP API](https://grafana.com/docs/grafana/latest/developers/http_api/)
- [Elasticsearch search API](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-search.html)
- [Kibana API](https://www.elastic.co/docs/api/doc/kibana/)
