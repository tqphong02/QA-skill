---
name: hybrid-ui-ux-review
description: Audit UI/UX against requirements and design references for responsive layout, interaction states, visual hierarchy, keyboard behavior, task completion, recovery, metrics, and screenshots. Trigger on Figma, design tokens, visual regression, usability, SUS, task success, or design-to-code fidelity. Auto-route; do not require the skill name.
mode: hybrid
surface: ui-ux
role: reviewer
legacy_aliases: ui-ux-design-qa
---

## Plugin runtime contract

When this skill is loaded from QA Skill Suite, treat the directory containing this `SKILL.md` as `SKILL_ROOT` and its parent as `PLUGIN_SKILLS_ROOT`. Resolve bundled scripts, references, templates, and sibling skills from those directories. Do not copy plugin assets into the user's project. Invoke a bundled script by its resolved absolute path while keeping the user's project as the working directory, unless that script explicitly requires another working directory.


<!-- qa-runs-contract:start -->
## Local run organization

When this workflow creates local reports, evidence, logs, converted intermediates, or other non-source deliverables and the user did not request an exact output path:

1. Start a fresh run with `node <skill-root>/scripts/qa-runs.mjs start --skill <skill-name> --label <short-scope>` when the bundled helper exists. In a QA-skill source checkout use `<repo-root>/scripts/qa-runs.mjs`. If neither helper exists, create the same layout manually
2. Keep every run-owned file under the returned `<project-root>/qa-runs/<skill-name>/<timestamp>_<scope>/` directory. Never emit generated files into the project root or overwrite an earlier run
3. Put the primary human-readable summary at `report.md` when the output format permits. Preserve required machine-readable and native filenames inside the same run directory
4. Finish the run with `qa-runs.mjs finish --run-dir <run-dir> --status <status> [--primary <report-path>]` so `LATEST.md`, `INDEX.md`, root `latest.json`, and per-skill `latest.json` point to the newest run
5. In the final response, link the primary report, the timestamped run directory, and `qa-runs/INDEX.md`; identify the run ID and status explicitly

An exact user path, a source-code deliverable that belongs in the target repository, or a safety-mandated location overrides this layout. Register or link the result without copying secrets or sensitive evidence into the index
<!-- qa-runs-contract:end -->
# UI/UX Design QA

Review the design contract before judging implementation quality. This skill covers visual and interaction intent; WCAG conformance is handed to `hybrid-accessibility`, while live navigation and network/console observation are handed to `dynamic-web-exploratory`.

## Workflow

1. Resolve the exact page, design reference, requirement IDs, viewport matrix, and allowed evidence location
2. Compare structure, spacing, typography, color, hierarchy, content states, interaction feedback, and responsive behavior
3. Check default, loading, validation, error, empty, and success states where the feature supports them
4. When usability testing is in scope, define representative participants, task success criteria, discoverability, comprehension, error recovery, task length and target metrics
5. Validate `usability.json` with `check_usability_artifact.py`; keep `READY` plans separate from observed `PASS` results
6. Verify keyboard/focus and contrast expectations through `hybrid-accessibility`; do not treat a screenshot-only review as an accessibility pass
7. For a live app, use `dynamic-web-exploratory` and keep screenshot, console, page-error, and network evidence in the same browser session
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
python3 ./scripts/check_uiux_artifact.py review.json --base-dir .
```

The packet must map screens and states to requirement IDs, viewport evidence, and existing screenshot or video paths. The checker is a preflight, not a pixel-perfect replacement for a human review.

## Hard gates

- No target, design source, expected behavior, or role/data means `BLOCKED`, not a guessed review
- A usability result without participant profile, consent policy, task metrics or evidence is `BLOCKED`
- Do not store participant names, emails, credentials or raw personal data in usability artifacts
- Do not mutate an application, submit a form, or change design files during discovery without explicit approval
- A `PASS` visual claim requires media evidence; JSON, DOM, or trace data alone is insufficient
- Do not claim WCAG compliance from this skill; use `hybrid-accessibility` for automated and manual accessibility evidence
- Keep design-source, requirement, implementation, and runtime evidence provenance separate

## Output contract

Write a pretty-printed JSON report with `passed`, `errors`, `warnings`, `checks`, `screens`, and `evidence`. Findings must include a stable screen/state identifier, expected source, observed result, severity, and evidence path. A live report must also reference the same-session browser run ID.

## References

- [Review matrix](references/REVIEW_MATRIX.md)
- [Usability testing contract](references/USABILITY_TESTING.md)
- [Deterministic artifact checker](scripts/check_uiux_artifact.py)
- [Usability artifact checker](scripts/check_usability_artifact.py)
