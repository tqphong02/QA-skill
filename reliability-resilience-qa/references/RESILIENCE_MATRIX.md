# Reliability and resilience matrix

| Stage | Required proof |
|---|---|
| Hypothesis | failure mode, affected dependency and expected behavior |
| Steady state | baseline SLO/SLI and observation window |
| Injection | bounded action, blast radius and approval reference |
| Stop | explicit abort threshold and owner contact |
| Recovery | restore action, RTO/RPO measurement and data-integrity check |
| Learning | logs, metrics, trace IDs and follow-up owner |

A plan is not a measured result; preserve that distinction in the report
