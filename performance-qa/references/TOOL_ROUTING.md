# Performance tool routing

| Need | Primary tool | Notes |
|---|---|---|
| Single-user page timing | Playwright | fast smoke gate inside browser suite |
| Core Web Vitals and main-thread diagnosis | Chrome DevTools MCP | save trace and disable external CrUX lookup when required by policy |
| API concurrency, p95/p99, CI load | internal k6 adapter | generate or reuse k6 script and run in a separate CI job |
| GUI-editable enterprise test plan | internal JMeter adapter | generate `.jmx`, import in GUI, execute non-GUI for evidence |
| Existing dashboards and logs | Grafana MCP read-only | correlate, do not treat dashboard access as load authorization |
| Browser protocol flow at scale | Playwright for discovery, k6/JMeter for load | do not scale interactive browser sessions by default |

## Test types

- Baseline: one user or minimal traffic
- Load: expected traffic and duration
- Stress: increase until a limit appears
- Spike: sudden traffic transition
- Soak: sustained target load for leak or degradation detection
- Scalability: compare capacity across resource configurations

Stress, spike, soak, and scalability runs need explicit approval immediately before execution.
