# Release gate matrix

| Gate | Pass condition | Block or fail condition |
|---|---|---|
| Scope | release, build and impacted areas are named | unknown artifact or scope |
| Functional | required suites pass with a known run ID | failed critical path or missing result |
| Risk | no open critical/high defect without approved exception | open defect or unapproved exception |
| Evidence | referenced files exist and are attributable | missing, stale or claim-only evidence |
| Approval | named QA and release owner approval is present | owner or authorization absent |
| Exit criteria | every required criterion is explicitly passed | criterion missing, false or unresolved |

`BLOCKED` means proof or authority is missing; `FAIL` means a known gate is not satisfied
