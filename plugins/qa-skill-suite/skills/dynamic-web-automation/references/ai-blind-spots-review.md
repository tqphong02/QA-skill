# AI blind-spot review and silent-failure hunting

Use at Step 2 (Test Design) and Step 8 (Script Review) of `ai-agentic-api-testing.md`, and whenever the same model wrote the code under test and the tests for it. Concepts adapted from the MIT-licensed `affaan-m/ecc` skills `ai-regression-testing` and agent `silent-failure-hunter`; wording and mapping are specific to this skill

## Why this exists

A model that writes a fix and then reviews it carries the same assumption into both steps. A green review proves nothing about the assumption. Only an executed assertion against an independent oracle (approved testcase, contract, DB read-back) can catch it. Treat "looks correct" from the authoring model as zero evidence

## Four blind-spot patterns to design cases for

| Pattern | What goes wrong | Case to design | Assertion that catches it |
|---|---|---|---|
| Sandbox/production path mismatch | Mock or sandbox branch returns the new field, the real branch does not | Same request against every declared path (mock, sandbox, real) when more than one exists | Same required fields and types on every path; compare via the shared Zod schema |
| Field omitted in the data layer | New field is added to the response mapper but not to the query or persistence call | Create, then read back through a different operation | Field present and equal after read-back, not only in the create response |
| Error-state leakage | Error from request N is still visible in request N+1 | Failing request followed by a valid request in a fresh test context | Second response has no residual error body, headers or cached state |
| Optimistic update without rollback | UI or client state changes before the API answers and stays changed on 4xx or 5xx | Force a documented failure (approved stub or invalid payload) and re-read state | State equals the pre-request value after the failure |

Only design a pattern case when the source or contract shows the path exists. Do not invent a sandbox path

## Silent-failure hunt (apply to specs, clients and helpers)

Flag each hit as `FIX` or `ASK` in the review report:

- Empty `catch` or an error converted to `null`, `[]` or `{}` with no assertion on it
- `.catch(() => [])`, `?? defaultValue` or `|| fallback` around a response that the test is supposed to verify
- Assertions inside `try` without rethrow, or `expect.soft` with no final check
- Logging an error and continuing, so the test still ends `PASS`
- `if (element)` or `if (response.ok())` guards that skip assertions when the thing is absent
- Cleanup in `finally` that swallows its own failure and hides leaked data

A test that cannot fail for the behavior it names is `FAILED` in review, whatever its runtime status

## Reviewer independence

1. The reviewing pass must read the approved testcase and contract first, not the author's reasoning
2. Prefer a second reviewer with a different prompt role (validator) over the same prompt run twice
3. Every blocker the reviewer cites needs a file and line or an executed command, otherwise it is `ASK`
4. Record in the report which patterns were checked and which had no applicable path (`N/A` with reason)

## Regression protection for fixed defects

For each confirmed defect, add or reference one executable case that fails on the buggy behavior and passes on the fix. Tie it to the defect ID and the testcase ID so Traceability holds. Do not mark the defect verified from review alone

