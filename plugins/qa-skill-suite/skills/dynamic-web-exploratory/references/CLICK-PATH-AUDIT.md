# Click-path audit

Use in `DISCOVERY_CORE` when each handler works on its own but the user-visible outcome is wrong, for example a button that does nothing, a form that resets itself, or a state that flips back. Concept adapted from the community skill `click-path-audit` in MIT-licensed `affaan-m/ecc`; the verdict and evidence rules below follow this repository's contract

## Bug class

Individual calls succeed, console is clean, types are right, yet the final state contradicts the label. Typical cause: call B has a side effect on shared state that undoes call A, or two async calls race and the later one wins

## Procedure per touchpoint

1. Pick one interactive element in scope (button, link, toggle, submit, shortcut) and record route, role and starting state
2. State the promise: the exact outcome its label or the source says it produces. If no source states it, mark `ASK` and stop for that element
3. Observe in the live page from the same Browser MCP session: network requests in order, console, visible state before and after, URL, focus
4. When source is available and in scope, list the handler calls in order and for each one note the state it reads, the state it writes and any side effect on shared stores. This is a candidate list, not proof
5. Compare the final observed state with the promise. A mismatch is a candidate defect
6. Reproduce once more from a clean state. One non-reproducible observation is `UNTEST` for that element, not `FAILED`

## What to look for

| Signal | Example |
|---|---|
| Undo by side effect | `setMode(true)` then `selectItem(null)` where `selectItem` resets `mode` |
| Order dependence | Result differs when the same two actions are triggered in the other order |
| Stale closure or race | Fast double click, or response of request 1 arriving after request 2 |
| Optimistic state without rollback | UI updates, API returns 4xx or 5xx, UI keeps the new value |
| Silent no-op | Handler runs, network empty, no visible change, no error |
| Cross-surface drift | Another tab, header counter or list does not reflect the change |

## Scope control

- One feature area per run; list every touchpoint, then audit them in a fixed order
- Read-only by default. Do not run a mutating journey (checkout, delete, bulk update) without an owned target, test data and cleanup, and never against production
- Redact tokens, cookies and personal data from screenshots and traces

## Evidence and verdict

Each audited element gets one row: element, route and role, promise and its source, observed result, evidence path (screenshot, network log, console log, trace), verdict `PASS`, `FAILED`, `N/A` or `UNTEST`. Source reading alone never produces `PASS` or a confirmed defect; it only explains an observed mismatch. Hand confirmed defects to the owning tracker integration with the reproduction steps

## Handoff

Turn a confirmed defect into a deterministic case through `support-testcase-authoring`, then `dynamic-web-automation`. Keep the touchpoint ID so the regression case stays traceable

