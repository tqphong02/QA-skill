---
name: hybrid-accessibility
description: Audit web accessibility with WCAG 2.2, axe, Playwright, keyboard-only navigation, focus, zoom/reflow, contrast, semantics, forms, dynamic content, and screen readers. Trigger on accessibility, a11y, WCAG, axe, keyboard, focus, contrast, screen reader, regression, or remediation. Auto-route; do not require the skill name.
mode: hybrid
surface: web
role: auditor
legacy_aliases: accessibility-qa
---

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
# Accessibility QA

Combine automated rules with manual interaction. An axe scan alone never proves WCAG conformance.

## Hard gates

1. Resolve target pages, critical user journeys, WCAG level, browsers, viewport, language, authentication, and assistive technology scope
2. Read the project app guide and matching feature guide before browser interaction when working inside QA-MDS
3. Write a test contract with target, role, journey, expected behavior, evidence path, and stop condition
4. Run automated checks only after the relevant dynamic state is visible
5. Verify keyboard and focus behavior manually for every critical journey
6. Keep automated violations, incomplete checks, and manual findings separate
7. Never claim a screen reader passed unless that screen reader and browser combination was actually exercised

Read [references/MANUAL_MATRIX.md](references/MANUAL_MATRIX.md) before a full audit.

## Tool routing

- Use Playwright CLI or the existing `dynamic-web-exploratory` browser route to reach deterministic states
- Use `@axe-core/playwright` for WCAG-tagged automated checks; start from [assets/axe-playwright.spec.ts](assets/axe-playwright.spec.ts)
- Use Playwright MCP only for an unfamiliar interactive branch that cannot be understood efficiently through scoped CLI snapshots
- Use browser-native accessibility inspection for name, role, state, and relationships
- Use BrowserStack only when licensed real-browser, real-device, or its accessibility service is required
- Use a real screen reader for screen-reader verdicts: VoiceOver on macOS/iOS, NVDA or JAWS on Windows, TalkBack on Android

## Workflow

### 1. Inventory journeys and states

List critical pages and expose default, loading, error, empty, validation, modal, menu, expanded, notification, and success states. Include logged-out and role-specific states where applicable.

### 2. Run automated checks

Run axe at page load and again after opening dynamic content. Store the rule ID, WCAG tags, impact, target selector, help URL, and page state. Do not paste full DOM or accessibility trees into reports.

### 3. Run keyboard checks

Starting with no pointer interaction, verify skip links, tab order, visible focus, reverse navigation, activation, escape behavior, focus trap, return focus, no keyboard trap, and access to every critical action.

### 4. Verify semantics and forms

Check landmarks, headings, accessible names, roles, states, instructions, labels, required fields, error identification, error association, status announcements, table semantics, and alternative text.

### 5. Verify visual adaptation

Check 200% zoom, 400% where applicable, 320 CSS-pixel reflow, text spacing, orientation, contrast, non-text contrast, target size, motion, flashing, and content on hover or focus.

### 6. Run screen-reader journeys

Exercise only the agreed critical paths. Record screen reader, browser, OS, version, reading order, announcements, control name and state, errors, live regions, and blocker details.

### 7. Report and retest

Group duplicate nodes by root cause. Each finding includes WCAG criterion, affected journey, steps, actual announcement or behavior, expected behavior, impact on users, evidence, severity, and remediation direction.

## Completion checks

- Automated scans covered visible dynamic states
- Incomplete axe results were manually reviewed or marked blocked
- Keyboard-only critical journeys have verdicts
- Focus entry, trap, escape, and return were checked for overlays
- Zoom and reflow were checked
- Screen-reader claims name the actual environment
- Findings identify user impact and WCAG criterion
- Coverage gaps remain explicit
