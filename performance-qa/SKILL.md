---
name: performance-qa
description: Design and execute safe web, API, service, and data-pipeline performance baselines; define SLIs and thresholds; analyze frontend traces and Core Web Vitals; generate k6 or JMeter workloads; identify bottlenecks; and produce reproducible performance evidence. Use for latency, throughput, concurrency, load, stress, spike, soak, scalability, performance regression, Chrome DevTools MCP, or k6 MCP installation and diagnosis.
---

# Performance QA

Select the smallest tool that answers the performance question. Load tests are state-changing operational actions even when requests are logically read-only.

## Hard gates

1. Resolve exact environment, owner approval, workload, user journey, data, exclusions, rate limit, duration, rollback, monitoring, and abort thresholds
2. Never run load against production without written authorization naming the target and workload
3. Capture idle health and baseline before adding concurrency
4. Start with one user and increase load in controlled stages
5. Stop on elevated error rate, service instability, resource saturation, or the agreed abort condition
6. Keep client-side saturation separate from server-side bottlenecks
7. Never compare runs with different environments, datasets, caches, or workload models without disclosing the difference

Read [references/TOOL_ROUTING.md](references/TOOL_ROUTING.md) before choosing a runner. Start each engagement from [assets/performance-contract.example.json](assets/performance-contract.example.json).

Read [references/MCP_SETUP.md](references/MCP_SETUP.md) before installing or diagnosing Chrome DevTools MCP or k6 MCP. Run `../github-mcp-qa/scripts/doctor-stack.sh chrome-devtools k6` after configuration.

## Tool routing

- Use Playwright timing for one-user browser smoke and navigation timing
- Use Chrome DevTools MCP for frontend trace, network waterfall, LCP, INP, CLS, long tasks, and runtime bottlenecks
- Reuse `../playwright-pom-automation/assets/templates/tests/performance/k6-load-test.js` for k6 API load; do not create a competing k6 framework
- Use k6 MCP when available for authoring, validation, and controlled execution
- Treat MCP configuration as separate from load authorization; an available k6 tool never bypasses the workload contract or approval gate
- Route a requested importable `.jmx` project to `jmeter-qa`
- Use Grafana MCP in read-only mode only when the project already exposes relevant metrics and logs

## Workflow

### 1. Define workload and SLIs

Record arrival or concurrency model, endpoint mix, think time, test data, authentication, cache state, warm-up, stages, duration, expected throughput, and SLIs such as p50, p90, p95, p99, error rate, request rate, queue time, and resource utilization.

### 2. Establish baseline

Verify service health and run one-user smoke. Capture client and server timestamps, response correctness, environment version, dataset size, and monitoring availability.

### 3. Run controlled stages

Use warm-up, baseline, target, and recovery stages. Stress, spike, soak, concurrency, destructive data setup, or high-volume runs require explicit approval immediately before execution.

### 4. Validate correctness under load

Assert status, schema, business outcome, and data cleanup. A fast incorrect response is a failure. Avoid coordinated omission by choosing the correct arrival model for the expected traffic.

### 5. Correlate bottlenecks

Compare latency and error changes with CPU, memory, database, pool, queue, network, browser main thread, cache, and downstream dependencies. Mark a bottleneck as suspected until a controlled comparison supports it.

### 6. Report

Include contract, environment, workload stages, thresholds, results by percentile, errors, throughput, monitoring correlation, test-data impact, abort events, recovery, limitations, and reproducible commands.

## Completion checks

- Authorization and abort thresholds are recorded
- Baseline and recovery health are captured
- Workload and dataset are reproducible
- Functional assertions ran under load
- Percentiles and error rate have verdicts
- Client saturation was checked
- Cleanup is verified
- Bottleneck claims have correlated evidence
