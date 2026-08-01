# Release gate matrix

| Gate | Pass condition | Block or fail condition |
|---|---|---|
| Scope | release, build and impacted areas are named | unknown artifact or scope |
| Functional | required suites pass with a known run ID | failed critical path or missing result |
| Quality metrics | counts are valid, no failed/flaky/blocked result, evidence is complete and risk coverage is 100% | missing denominator, flaky result, incomplete evidence or uncovered required risk |
| Risk | no open critical/high defect without approved exception | open defect or unapproved exception |
| Evidence | referenced files exist and are attributable | missing, stale or claim-only evidence |
| Approval | named QA and release owner approval is present | owner or authorization absent |
| Exit criteria | every required criterion is explicitly passed | criterion missing, false or unresolved |
| Post-release | named owner, smoke/canary and rollback readiness are present | no owner, smoke plan or rollback readiness |

`BLOCKED` means proof or authority is missing; `FAIL` means a known gate is not satisfied
