---
name: jmeter-qa
description: Generate, validate, import, and run portable Apache JMeter `.jmx` plans for HTTP/API performance testing. Trigger on JMeter, `.jmx`, endpoint flows, curl-like requests, CSV data, assertions, token extraction, thread groups, ramp-up, duration, or thresholds; do not require the skill name. A supplied `.jmx` alone is enough to load this skill for safe inspection/validation. Use performance-qa for the workload contract before executing load.
---

# JMeter QA

Generate reviewable `.jmx` plans and keep workload authorization owned by `performance-qa`.

## Hard gates

1. Resolve target environment, authorization, workload, endpoint flow, test data, credentials, cleanup, monitoring, and abort conditions
2. Do not run generated load against production without written authorization naming the workload
3. Never hardcode passwords, tokens, cookies, or private keys in JSON or `.jmx`; use JMeter properties, environment-backed setup, CSV, or a secret provider
4. Start with one thread and one loop to verify correctness before increasing load
5. Assert response code and business response for every critical request
6. Use the GUI to inspect or debug; use non-GUI mode for evidence-bearing load runs
7. Verify generated XML before claiming the plan is importable

Read [references/CONFIG_SCHEMA.md](references/CONFIG_SCHEMA.md) before authoring advanced flows. Start from [assets/jmeter-plan.example.json](assets/jmeter-plan.example.json).

## Workflow

### 1. Check prerequisites

```bash
java -version
jmeter -v
```

If JMeter is unavailable, still generate and XML-validate the `.jmx`, then report that runtime validation is blocked at the JMeter executable layer.

### 2. Define the project

Copy the example config and set base URL, threads, ramp-up, loops or duration, headers, CSV data, think time, request sequence, expected status, body assertions, and JSON extractors.

Keep values parameterized. The generator exposes `PROTOCOL`, `HOST`, `PORT`, and `BASE_PATH` through `__P`, so the same `.jmx` can target another approved environment without editing XML.

### 3. Generate the plan

```bash
python3 scripts/generate_jmx.py \
  --config jmeter-plan.json \
  --output performance/my-api-plan.jmx
```

The output is a standard JMeter Test Plan containing HTTP Request Defaults, Header Manager, optional CSV Data Set Config, one Thread Group, optional think-time timer, HTTP samplers, response assertions, body assertions, and JSON extractors.

### 4. Validate and import

```bash
python3 scripts/generate_jmx.py --config jmeter-plan.json --validate-only
```

Then open JMeter GUI and use `File → Open` to import the generated `.jmx`. Review resolved paths, variables, credentials, request order, assertions, thread count, ramp-up, loop or duration, and cleanup behavior.

### 5. Smoke with one thread

Override workload without editing the plan:

```bash
jmeter -n -t performance/my-api-plan.jmx \
  -JTHREADS=1 -JRAMP_UP=1 -JLOOPS=1 \
  -l performance/smoke.jtl
```

Confirm authentication, correlation variables, response assertions, and data cleanup before load.

### 6. Run the approved workload

```bash
jmeter -n -t performance/my-api-plan.jmx \
  -JPROTOCOL=https -JHOST=staging.example.com -JPORT=443 \
  -JTHREADS=10 -JRAMP_UP=30 -JLOOPS=5 \
  -l performance/results.jtl \
  -e -o performance/html-report
```

Use a fresh HTML report directory. Stop on the engagement abort thresholds. Do not add heavy GUI listeners to a load plan.

### 7. Report

Include configuration file, `.jmx` checksum, JMeter and Java versions, command, resolved non-secret properties, workload stages, assertions, errors, percentiles, throughput, environment monitoring, cleanup, and limitations.

## Completion checks

- Config contains no secret value
- XML parses and has a Test Plan plus Thread Group
- Every request has expected status
- Correlation variables are defined before use
- One-thread smoke passes before load
- GUI import was verified when JMeter is available
- Evidence run used non-GUI mode
- Results and HTML report paths are recorded
- Cleanup and recovery health are verified
