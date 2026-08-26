# Reliability and resilience matrix

| Stage | Required proof |
|---|---|
| Hypothesis | failure mode, affected dependency and expected behavior |
| Steady state | baseline SLO/SLI and observation window |
| Injection | bounded action, blast radius and approval reference |
| Stop | explicit abort threshold and owner contact |
| Recovery | restore action, RTO/RPO measurement, explicit backup/restore scope, and data-integrity check |
| Learning | logs, metrics, trace IDs and follow-up owner |

A plan is not a measured result; preserve that distinction in the report

## Backup and restore contract

Declare `recovery.backup_restore_in_scope` as `true` or `false` in every plan

- `true`: provide `backup_reference`, non-empty ordered `restore_steps`, and `data_integrity_check`
- `false`: provide `backup_restore_reason` explaining why the experiment cannot affect recoverable data

The validator checks the contract only. A PASS means the recovery proof is planned, not that a backup was restored successfully
