# Senior fullstack QA/QC review checklist

Review every area below before generating outputs. Do not mark an area `checked` merely because the document does not mention it. Create a Q&A item or mark it `blocked` when the missing information can change implementation or testing

## 1. Scope and actors

- In-scope and out-of-scope functions
- Actor, role, tenant and ownership boundaries
- Entry channels such as UI, API, batch, import or scheduled job

## 2. Entry and preconditions

- Required account, permission, configuration and data state
- Trigger and starting state
- Behavior when a precondition is missing or stale

## 3. Happy flow

- Ordered user and system actions
- Observable success outcome
- Persistence and downstream effect

## 4. Alternate and exception flow

- Cancel, retry, back, refresh and resume
- Empty result, partial success and dependency failure
- Recovery and compensation behavior

## 5. Business rules

- Calculation, eligibility, ordering and precedence
- Effective date, timezone, locale and rounding
- Conflicting rules across sections or documents

## 6. States and transitions

- Valid states and transition owners
- Forbidden transition and repeated action
- Terminal, archived, deleted and restored state

## 7. Roles and permissions

- View, create, update, delete, approve and export rights
- Field-level and record-level access
- Direct URL or API access outside the UI

## 8. Input and validation

- Required, optional, default and derived fields
- Type, format, boundary, length and uniqueness
- Cross-field validation and sanitization

## 9. Data lifecycle and persistence

- Source of truth and save timing
- Refresh, reload, cache and eventual consistency
- Retention, deletion, restore and historical audit

## 10. API and integration

- Request, response, status, timeout and retry contract
- Authentication, idempotency and duplicate delivery
- Third-party degraded or unavailable behavior

## 11. Error handling and recovery

- User-facing message and technical error mapping
- Retryability, rollback and partial write
- Support or operational recovery path

## 12. Concurrency and idempotency

- Double submit and repeated callback
- Two users editing the same record
- Locking, version conflict and duplicate prevention

## 13. Security and privacy

- Authentication and authorization boundary
- Sensitive data exposure and masking
- Injection, unsafe upload, rate limit and abuse case

## 14. Performance and capacity

- Response time and batch duration expectation
- Maximum record, file, row and concurrent user volume
- Pagination, timeout and resource limit

## 15. UI UX and accessibility

- Loading, empty, error, disabled and focus states
- Responsive layout, overflow, modal, dropdown and popup behavior
- Keyboard access, label, contrast and screen-reader expectation

## 16. Audit logging and observability

- Who changed what and when
- Correlation ID, job status and operational visibility
- Alert, metric and trace needed for failures

## 17. Compatibility and migration

- Browser, device, version and locale support
- Existing data compatibility and migration
- Backward compatibility for API or import template

## 18. Testability and acceptance criteria

- Expected results are observable and measurable
- Test data and environment are available
- Each acceptance criterion has an authority and source reference

## Question quality gate

Each Q&A item must identify:

- Exact source reference or missing source
- The unclear or conflicting statement
- Risk if unanswered
- One direct question answerable by BA, PO, Dev, Architect or another owner
- Proposed assumption clearly labeled as a proposal
- Priority and status
