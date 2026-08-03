---
name: ui-ux-design-qa
description: Audit UI and UX intent and run structured usability reviews against requirements, design references, responsive layouts, interaction states, visual hierarchy, keyboard behavior, task completion, error recovery, usability metrics and screenshot evidence. Trigger on UI/UX review, Figma, design tokens, visual regression, responsive design, usability testing, task success, learnability, SUS, layout, interaction states, or design-to-code fidelity; do not require the skill name. Use local artifacts first and route live browser execution to qa-run with same-session evidence.
---

# UI/UX Design QA

Review the design contract before judging implementation quality. This skill covers visual and interaction intent; WCAG conformance is handed to `accessibility-qa`, while live navigation and network/console observation are handed to `qa-run`.

## Workflow

1. Resolve the exact page, design reference, requirement IDs, viewport matrix, and allowed evidence location
2. Compare structure, spacing, typography, color, hierarchy, content states, interaction feedback, and responsive behavior
3. Check default, loading, validation, error, empty, and success states where the feature supports them
4. When usability testing is in scope, define representative participants, task success criteria, discoverability, comprehension, error recovery, task length and target metrics
5. Validate `usability.json` with `check_usability_artifact.py`; keep `READY` plans separate from observed `PASS` results
6. Verify keyboard/focus and contrast expectations through `accessibility-qa`; do not treat a screenshot-only review as an accessibility pass
7. For a live app, use `qa-run` and keep screenshot, console, page-error, and network evidence in the same browser session
8. Classify each observation as `PASS`, `FAIL`, `BLOCKED`, or `CANDIDATE`; never infer a business rule from visual appearance alone

## Usability testing

Use [references/USABILITY_TESTING.md](references/USABILITY_TESTING.md) for
participant and metric definitions. Measure success rate, median time, user
errors and moderator assistance; add SUS when a standardized score is useful

Usability evidence is based on pseudonymous participant observations and
consent-backed notes or recordings. A UI heuristic review can identify a
candidate problem, but it cannot replace representative task observation

## Local contract

Use the deterministic checker when a review packet is available:

```bash
python3 ui-ux-design-qa/scripts/check_uiux_artifact.py review.json --base-dir .
```

The packet must map screens and states to requirement IDs, viewport evidence, and existing screenshot or video paths. The checker is a preflight, not a pixel-perfect replacement for a human review.

## Hard gates

- No target, design source, expected behavior, or role/data means `BLOCKED`, not a guessed review
- A usability result without participant profile, consent policy, task metrics or evidence is `BLOCKED`
- Do not store participant names, emails, credentials or raw personal data in usability artifacts
- Do not mutate an application, submit a form, or change design files during discovery without explicit approval
- A `PASS` visual claim requires media evidence; JSON, DOM, or trace data alone is insufficient
- Do not claim WCAG compliance from this skill; use `accessibility-qa` for automated and manual accessibility evidence
- Keep design-source, requirement, implementation, and runtime evidence provenance separate

## Output contract

Write a pretty-printed JSON report with `passed`, `errors`, `warnings`, `checks`, `screens`, and `evidence`. Findings must include a stable screen/state identifier, expected source, observed result, severity, and evidence path. A live report must also reference the same-session browser run ID.

## References

- [Review matrix](references/REVIEW_MATRIX.md)
- [Usability testing contract](references/USABILITY_TESTING.md)
- [Deterministic artifact checker](scripts/check_uiux_artifact.py)
- [Usability artifact checker](scripts/check_usability_artifact.py)
