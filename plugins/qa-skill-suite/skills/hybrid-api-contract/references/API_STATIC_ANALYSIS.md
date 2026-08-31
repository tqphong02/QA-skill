# API Static Analysis Reference

Read this document when running the static semantic analysis mode of
`hybrid-api-contract`. Describes gap categories, Q&A quality gate, and
terminal result definitions.

---

## Boundary

`analyze_openapi.py` operates **source-only**. Reads an OpenAPI 3.x document
and reports spec-level gaps. Does **not** call a live endpoint and does **not**
claim runtime conformance.

The analyzer expands valid local `$ref` pointers before semantic checks and
fails closed on an unresolved local reference. Recursive schemas are bounded at
the cycle edge. External references must be bundled first; otherwise the static
analysis returns `BLOCKED` instead of claiming semantic completeness.

- Static analysis → `_API_Analysis_Source.json`, `_API_Q&A.md`, `_API_Q&A.xlsx`
- Runtime validation → Workflow steps 3-6 in SKILL.md (live requests)

---

## Coverage map — CONTRACT_MATRIX (8 areas) + extensions

### Request (14 checks per operation)
| # | Check | CONTRACT_MATRIX item |
|---|---|---|
| 1 | Mutating method missing `requestBody` | body |
| 2 | `requestBody` missing Content-Type | content type |
| 3 | `requestBody` has Content-Type but no schema | body |
| 4 | No `required[]` declared in schema | required |
| 5 | Fields missing `type`/`format` | format |
| 6 | Enum-looking string field without `enum[]` | enum |
| 7 | String fields without `maxLength` | format |
| 8 | Date/time field without `format: date-time` | format |
| 9 | Numeric field without `minimum`/`maximum` | format |
| 10 | Sensitive input field without `writeOnly: true` | body |
| 11 | Query params without `description` | query |
| 12 | Query params without `example` | query |
| 13 | Path param `{x}` not declared in `parameters[]` | path |
| 14 | File upload missing max size and allowed types | body |

### Response (19 checks per operation)
| # | Check | CONTRACT_MATRIX item |
|---|---|---|
| 1 | Missing 401/403 | status |
| 2 | 401 without `WWW-Authenticate` response header | headers |
| 3 | Missing 400/422 for mutating methods | status |
| 4 | POST missing 409 Conflict | status |
| 5 | Missing 404 for path-param endpoints | status |
| 6 | Missing 500 | status |
| 7 | Missing 429 rate-limit for write methods | status |
| 8 | Missing 503/504 for critical write endpoints | status |
| 9 | 2xx missing schema | schema |
| 10 | 2xx missing Content-Type | content type |
| 11 | 204 No Content with Content-Type declared | content type |
| 12 | Error shape inconsistency across 4xx/5xx | error shape |
| 13 | POST 201 missing `Location` header | headers |
| 14 | GET missing `Cache-Control`/`ETag` | headers |
| 15 | Response is bare array (not wrapped) | schema |
| 16 | Response schema missing `id` field | required fields |
| 17 | Response schema missing `created_at`/`updated_at` | required fields |
| 18 | Async operation (import/export) without 202 Accepted | status |
| 19 | Nullable fields not declared in schema | nullable |

### Auth (8 checks per operation)
| # | Check | CONTRACT_MATRIX item |
|---|---|---|
| 1 | No security scheme on endpoint | missing |
| 2 | API key in query string (OWASP API7) | missing |
| 3 | OAuth2 scheme without scopes | scope |
| 4 | HTTP Basic Auth (credentials exposed) | missing |
| 5 | Missing 403 Forbidden | wrong role |
| 6 | 401 without `WWW-Authenticate` header | expired/invalid |
| 7 | Wrong tenant: no tenant isolation documented | wrong tenant |
| 8 | JWT not documented (scheme type undocumented) | invalid |

### Lifecycle (6 checks per operation)
| # | Check | CONTRACT_MATRIX item |
|---|---|---|
| 1 | DELETE missing 200/204 | delete |
| 2 | DELETE soft vs hard delete not documented | delete |
| 3 | DELETE cascade behavior not documented | delete |
| 4 | PATCH partial update semantics not documented | update |
| 5 | PUT full replace semantics not documented | update |
| 6 | POST side effects/resource not documented | create/persistence |

### Collection (6 checks on GET list endpoints)
| # | Check | CONTRACT_MATRIX item |
|---|---|---|
| 1 | No pagination parameter | page boundaries |
| 2 | Has pagination but no `total` count in response | page boundaries |
| 3 | Has pagination but no `next`/`prev` links | page boundaries |
| 4 | No filter parameter | filter |
| 5 | No sort/order parameter | sort |
| 6 | No `Link` header (RFC 5988) | page boundaries |

### Reliability (5 checks per operation)
| # | Check | CONTRACT_MATRIX item |
|---|---|---|
| 1 | POST missing idempotency key | idempotency/duplicate submission |
| 2 | No timeout/retry contract documented | timeout contract/retry |
| 3 | PUT/PATCH missing concurrency token (ETag/If-Match) | concurrency token |
| 4 | Has ETag but no 412 Precondition Failed | concurrency token |
| 5 | 429 without `Retry-After` header | retry |

### Compatibility (6 checks per operation + 3 cross-operation)
| # | Check | CONTRACT_MATRIX item |
|---|---|---|
| 1 | `deprecated` without migration guide | removed operation |
| 2 | `deprecated` without `x-sunset` date | removed operation |
| 3 | `x-internal` endpoint leaked in public spec | removed operation |
| XO-1 | No versioning strategy in path, `servers[].url`, or version header | narrowed type/auth change |
| XO-2 | Naming convention mixed (camelCase + snake_case) | removed operation |

### Observability (9 checks per operation + 3 cross-operation)
| # | Check | CONTRACT_MATRIX item |
|---|---|---|
| 1 | No `summary` or `description` | traceability |
| 2 | No `operationId` | traceability |
| 3 | No correlation/trace header in response | correlation ID |
| 4 | Sensitive field (`password`, `token`…) in response schema | no secret leakage |
| 5 | No `tags` on operation | traceability |
| 6 | No `example` in requestBody | traceability |
| 7 | `writeOnly` missing on sensitive input fields | safe error |
| 8 | oneOf/anyOf without `discriminator` | traceability |
| 9 | `additionalProperties` not declared | traceability |
| XO-1 | CORS/OPTIONS missing when `x-cors-required` or `x-browser-consumers` is true | safe error |

### Schema Quality (3 checks, overlapping with Request)
| # | Check |
|---|---|
| 1 | `oneOf`/`anyOf` without `discriminator` |
| 2 | Schema object without `additionalProperties` |
| 3 | Sensitive input field without `writeOnly: true` |

### Cross-operation (7 behavioral checks at document level)
| # | Check |
|---|---|
| XO-1 | Missing `servers[]` (no base URL) |
| XO-2 | HTTP (non-HTTPS) server URL |
| XO-3 | Global error shape inconsistency (≥3 different shapes) |
| XO-4 | No API versioning strategy |
| XO-5 | Naming convention inconsistency (camelCase vs snake_case) |
| XO-6 | CORS/OPTIONS missing when browser consumers are explicitly declared |
| XO-7 | Duplicate `operationId` across spec |

---

## Total checks

| Layer | Count |
|---|---|
| Per-operation checks (Q) | Behavioral checks across 9 categories |
| Cross-operation checks (XQ) | **7 conditional checks** |
| Documentation-only lint | Excluded from blocking Q&A unless an explicit `x-require-*` scope enables it |

---

## Q&A quality gate

A gap item is created only when:

1. The gap directly changes how a consumer or server would behave
2. An exact `source_ref` and `source_excerpt` identify the parent operation
3. Alternative answers change an observable contract (status code, schema, auth, idempotency)
4. The question is answerable by Dev, BA, PO, or Architect
5. A proposed assumption is clearly labeled as a proposal

Missing `info.contact`, `info.license`, or root `tags[]` is documentation lint,
not automatically a behavioral Q&A item. Enable those checks only with
`x-require-contact`, `x-public-api`, or `x-require-root-tags`. CORS is checked
only when `x-cors-required` or `x-browser-consumers` is true.

Zero Q&A items is a valid result when the spec is complete.

---

## `basis` allowed values

| Value | Meaning |
|---|---|
| `ambiguous_text` | Description allows multiple interpretations |
| `contradiction` | Two parts of spec define conflicting behavior |
| `missing_required_rule` | A contract element expected for this method/pattern is absent |
| `untestable_acceptance` | No observable success/failure criterion derivable |
| `unclear_ownership` | No security scheme or role definition exists |

---

## Priority levels

| Priority | Meaning |
|---|---|
| P0 | Security or data integrity risk; blocks testing |
| P1 | Contract gap that breaks consumer integration |
| P2 | Quality/completeness gap; reduces reliability or DX |

---

## Terminal results

| Result | Condition |
|---|---|
| `DONE` | All operations analyzed; zero open Q&A |
| `DONE_WITH_OPEN_QA` | Analysis complete; open Q&A items exist |
| `BLOCKED` | Spec unreadable or preflight errors prevent analysis |

`DONE_WITH_OPEN_QA` is terminal for the current spec snapshot.

---

## Handoff to live validation

After static analysis produces `_API_Analysis_Source.json`:

1. Give JSON and original spec to live validation workflow (Steps 3-6 in SKILL.md)
2. Update `coverage_status` from `not_covered` to `covered`/`partial`/`blocked` only after runtime evidence exists
3. Q&A items answered by Dev/BA should be reflected in spec before re-running analysis

---

## File outputs

```
<output_dir>/
├── <project>_API_Analysis_Source.json   ← canonical (internal, schema_version 3.0)
├── <project>_API_Q&A.md                 ← human-readable Q&A report
└── <project>_API_Q&A.xlsx               ← 4-sheet workbook
    ├── Summary          (project, spec, date, counts, terminal result)
    ├── Q&A              (16 columns, colour by priority/status)
    ├── Operation Ledger (13 columns, colour by fact_status)
    └── Review Coverage  (18 areas from SENIOR_REVIEW_CHECKLIST.md)
```

---

## Related references

- [CONTRACT_MATRIX.md](CONTRACT_MATRIX.md) — 8 check areas (source of truth)
- [POSTMAN_MCP.md](POSTMAN_MCP.md) — Postman integration
- [`../scripts/analyze_openapi.py`](../scripts/analyze_openapi.py) — gap analysis engine (76 Q + 10 XQ)
- [`../scripts/render_api_qa.py`](../scripts/render_api_qa.py) — Q&A renderer
- [SENIOR_REVIEW_CHECKLIST.md](../../static-requirements-analysis/references/SENIOR_REVIEW_CHECKLIST.md) — 18 review areas
