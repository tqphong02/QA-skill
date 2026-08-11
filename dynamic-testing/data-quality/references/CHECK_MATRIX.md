# Data quality check matrix

| Area | Minimum checks | Evidence |
|---|---|---|
| Schema | column presence, order when contractual, type, precision, scale, nullable | source and target schema snapshots |
| Completeness | row count, missing keys, unexpected keys, partition coverage | aggregate queries and missing-key sample |
| Accuracy | mapped value, derived value, aggregation, rounding | source-target pairs with rule reference |
| Uniqueness | business-key duplicates, retry duplicates | duplicate groups and run identifier |
| Null semantics | null, empty string, whitespace, zero, default | controlled boundary records |
| Integrity | parent-child references, orphan rows | orphan count and redacted keys |
| Freshness | source event time, ingestion time, target time, SLA | watermark and lag distribution |
| Incremental | insert, update, delete, late arrival, replay | before/after state per operation |
| Idempotency | same input or event replayed | unchanged target count and values |
| Fidelity | decimal, timezone, Unicode, binary, large value | exact source-target samples |
| Lineage | source field to transform to target field | mapping with observed stage outputs |
| Isolation | tenant, role, masking, retention | two-account or two-tenant control comparison |

## Reconciliation order

1. Confirm both snapshots represent the same logical cutoff
2. Compare schema and business keys
3. Compare counts by partition or business segment
4. Compare null and duplicate profiles
5. Compare aggregates for important numeric fields
6. Compare deterministic row hashes excluding approved volatile columns
7. Inspect a small redacted sample of mismatches
8. Re-run a control record before confirming a defect

## Common false conclusions

- Equal counts do not prove equal records
- A target-only timestamp may be intentionally volatile and must be excluded explicitly
- Different decimal formatting can still represent the same numeric value; compare according to the contract
- Timezone conversion is not data loss when the instant remains identical
- A retry is not idempotent merely because it returned success
- A scanner or profiler warning is not a confirmed pipeline defect
