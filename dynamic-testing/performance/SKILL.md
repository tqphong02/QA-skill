---
name: dynamic-performance
description: Orchestrate safe JMeter or k6 performance testing for latency, throughput, concurrency, load, stress, spike, soak, volume, scalability, and capacity. Trigger on virtual users, request rate, JMX, JTL, Thread Group, k6 scripts, Chrome DevTools, thresholds, reports, or bottlenecks. A bare test file authorizes inspection only. Auto-route; do not require the skill name.
mode: dynamic
surface: performance
role: orchestrator
legacy_aliases: performance-qa
---

# Performance QA

Use one public skill and two internal engines. Never ask the user or intern to
select a separate JMeter skill.

For first-time human setup and usage, see [GUIDE.md](GUIDE.md).

## Deterministic flow

1. Run `python3 scripts/performance_orchestrator.py doctor`
2. Run `python3 scripts/performance_orchestrator.py discover --root <project-root>`
3. Resolve engine:
   - Exact `.jmx` → JMeter
   - Exact k6 `.js`, `.ts`, or `.mjs` → k6
   - `engine: auto` with exactly one discovered engine → that engine
   - Both engines or no script → ask only for the engine; do not guess
4. Create the canonical run config by copying [assets/run-config.example.yaml](assets/run-config.example.yaml) or run:
   ```bash
   python3 scripts/performance_orchestrator.py wizard --output run-config.yaml
   ```
   For explicit inputs in one ignored file, copy
   [assets/performance.env.example](assets/performance.env.example) to `.env` and run
   `wizard --env-file .env`. Add `--non-interactive` when the `.env` file is
   complete and the wizard must fail instead of prompting for missing required
   values
5. Ask only fields required by the chosen workload model:
   - `concurrent-users`: users, ramp-up, hold, ramp-down, think time
   - `request-rate`: target rate, time unit, pre-allocated VUs, max VUs, duration
   - `total-iterations`: iterations, users, max duration, think time
6. Resolve p95, p99, maximum error rate, minimum throughput and abort behavior
   - Volume → validate `dataProfile` with dataset reference, target records or payload size, cleanup and integrity check
   - Scalability → validate `scalability` with comparison group, resource profile, expected capacity and a separate run per profile
7. Validate, display, and prepare without executing:
   ```bash
   python3 scripts/performance_orchestrator.py validate --config run-config.yaml
   python3 scripts/performance_orchestrator.py prepare \
     --config run-config.yaml \
     --project-root <project-root> \
     --output-root artifacts
   ```
8. Read back `run-config.yaml` and `run-plan.json`; show engine, target, workload,
   thresholds, approvals, smoke command, main command and artifact paths
9. Immediately before execution, obtain the approvals required below, then run:
   ```bash
   python3 scripts/performance_orchestrator.py run \
     --run-dir artifacts/<run-id> \
     --approve-load
   ```
10. The runner must execute one-user smoke first. Main load cannot start when
    smoke fails
11. Parse JTL or k6 JSON into `result.json`; generate `summary.md`,
    `summary.html`, engine-native report and redacted logs
12. Correlate latency/errors with CPU, memory, database, pool, queue, network,
    cache and downstream evidence before naming a bottleneck

## Hard gates

1. Resolve exact environment, owner, written authorization reference, target,
   workload, request mix/business flow, data, exclusions, cleanup, monitoring
   and abort conditions before load
2. A bare `.jmx`, JTL, k6 script or result file authorizes safe inspection only
3. Never run production without written authorization naming target and workload
   plus explicit approval immediately before execution
4. Any workload above one user, any request-rate load, and stress/spike/soak/volume/scalability
   require `--approve-load` immediately before the main run
5. More than `safety.maxUsers` (default 100) also requires
   `--approve-high-load`; production also requires `--approve-production`
6. Never hardcode passwords, tokens, cookies, API keys or private keys in config,
   JMX, k6 script, commands, logs or reports; use environment placeholders.
   A local `.env` is an input convenience only and must remain ignored by Git;
   the committed `performance.env.example` contains no credentials
7. Always capture idle health and run one user/one iteration before load
8. Stop when smoke fails, service health fails, connectivity is lost, resource
   saturation appears, or an agreed abort condition is met
9. Assert status and business response under load; a fast incorrect response is
   a failure
10. Do not compare runs whose environment, dataset, cache state or workload model
    differs without disclosing the difference
11. JMeter GUI is for import/debug only; evidence-bearing runs use non-GUI mode
12. MCP/runtime availability never grants load authorization

## Volume and scalability contracts

- Volume testing measures behavior against an explicit dataset or payload size; do not use a large user count as a substitute for data volume
- `dataProfile.datasetReference`, `records` or `payloadSizeBytes`, `cleanup`, and `integrityCheck` are required for `testType: volume`
- Scalability testing runs the same business workload against separate resource profiles; keep `scalability.comparisonGroup` constant and change only the approved profile/resource inputs
- `scalability.expectedCapacity` must declare `minUsers` or `minRequestsPerSecond`; compare normalized results only when environment, business flow and comparison group are compatible
- A scalability result without a baseline or candidate profile is `PARTIAL`, not proof of horizontal or vertical scaling

## Engine resources

- Read [references/COMMON_CONFIG.md](references/COMMON_CONFIG.md) when defining or
  validating the common config
- Read [references/JMETER.md](references/JMETER.md) only for JMeter generation,
  correlation, Thread Group or JMX import details
- Read [references/K6.md](references/K6.md) only for k6 scenarios and environment
  mapping
- Read [references/RESULTS.md](references/RESULTS.md) when normalizing, comparing
  or interpreting reports
- Read [references/TOOL_ROUTING.md](references/TOOL_ROUTING.md) for browser
  timing, Chrome DevTools, Grafana and runner selection
- Read [references/MCP_SETUP.md](references/MCP_SETUP.md) only for Chrome
  DevTools MCP or k6 MCP setup/diagnosis

## Completion checks

- One common config and exact engine are recorded
- Authorization, workload and abort conditions are complete
- Volume data profile or scalability capacity profile is complete when in scope
- Generated JMX parses or generated k6 script passes static preparation
- One-user smoke passed before main load
- Raw and native engine outputs are retained when requested
- `result.json`, `summary.md` and `summary.html` agree on PASS/FAIL
- p95, p99, error rate and throughput have threshold verdicts
- Slow endpoints and top errors are reported when native data provides them
- Cleanup and recovery health are verified
- Bottleneck claims have correlated evidence and limitations
- Volume cleanup and data-integrity evidence are retained when volume testing is in scope
- Scalability comparisons disclose expected profile/resource differences and retain baseline/candidate run IDs
