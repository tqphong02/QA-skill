# Common performance run config

The common YAML is the only user-facing configuration. Validate it with
`scripts/performance_orchestrator.py`; never maintain separate JMeter and k6
workload contracts.

## Engine and test type

- `engine`: `auto`, `jmeter`, or `k6`
- `testType`: `smoke`, `load`, `stress`, `spike`, `soak`, or `custom`
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

The canonical structure is
[assets/run-config.example.yaml](../assets/run-config.example.yaml); validation
rules are in [schemas/run-config.schema.json](../schemas/run-config.schema.json).
