# Common performance run config

The common YAML is the only user-facing configuration and the canonical run
configuration. An optional dotenv file is only an input layer for the wizard.
Validate the generated YAML with `scripts/performance_orchestrator.py`; never
maintain separate JMeter and k6 workload contracts.

## Optional `.env` input

Copy [assets/performance.env.example](../assets/performance.env.example) to the
ignored local file `.env`, fill the `PERF_*` values, then run either:

```bash
python3 scripts/performance_orchestrator.py wizard --env-file .env --output run-config.yaml
python3 scripts/performance_orchestrator.py wizard --env-file .env --non-interactive --output run-config.yaml
```

The first command shows each value so it can be reviewed or overridden. The
second command fails closed when a required value is missing. The env loader
parses `KEY=VALUE` without executing shell code and does not print values.
`PERF_*` covers target, workload, duration, thresholds, safety, test-data,
volume and scalability inputs. Keep request mix, headers, bodies and business
assertions in YAML. Secrets must remain placeholders such as `${TOKEN}`;
provide the real variable through the process environment immediately before an
approved run.

## Engine and test type

- `engine`: `auto`, `jmeter`, or `k6`
- `testType`: `smoke`, `load`, `stress`, `spike`, `soak`, `volume`, `scalability`, or `custom`
- `script.path`: optional `.jmx`, `.js`, `.ts`, or `.mjs`
- When no script exists, choose `jmeter` or `k6` and define `requests`

## Workload models

| Model | Required fields |
|---|---|
| `concurrent-users` | `users`, `rampUp`, `holdDuration`, `rampDown`, `thinkTime` |
| `request-rate` | `targetRate`, `timeUnit`, `preAllocatedVUs`, `maxVUs`, `holdDuration` |
| `total-iterations` | `iterations`, `users`, `holdDuration`, `thinkTime` |

Durations use `ms`, `s`, `m`, or `h`. Do not ask concurrency fields when the
model is request-rate.

## Target and safety

For load above one user, require:

- `target.owner`
- `target.authorizationReference`
- `safety.abortConditions`
- cleanup and monitoring references

`target.production: true`, environment `prod|production`, or a hostname that
explicitly contains `prod` activates the production approval gate.

Do not put credentials in YAML. Parameterize request values as `${TOKEN}`,
`${PASSWORD}`, or another environment variable placeholder.

## Volume profile

For `testType: volume`, add a `dataProfile` with a non-secret dataset reference,
at least one positive size dimension, cleanup instructions and a data-integrity
check

```yaml
dataProfile:
  datasetReference: PERF-DATA-100K
  records: 100000
  payloadSizeBytes: 2048
  cleanup: remove the isolated tenant after the run
  integrityCheck: compare record count and checksum with the seed manifest
```

## Scalability profile

For `testType: scalability`, prepare one config per resource profile and keep
`comparisonGroup` unchanged across the runs

```yaml
scalability:
  comparisonGroup: checkout-capacity-v1
  profile: baseline-2-replicas
  resourceReference: 2 application replicas and 4 vCPU
  expectedCapacity:
    minUsers: 100
    minRequestsPerSecond: 50
```

The canonical structure is
[assets/run-config.example.yaml](../assets/run-config.example.yaml); validation
rules are in [schemas/run-config.schema.json](../schemas/run-config.schema.json).
