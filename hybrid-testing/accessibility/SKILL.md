---
name: hybrid-accessibility
description: Audit web accessibility with WCAG 2.2, axe, Playwright, keyboard-only navigation, focus, zoom/reflow, contrast, semantics, forms, dynamic content, and screen readers. Trigger on accessibility, a11y, WCAG, axe, keyboard, focus, contrast, screen reader, regression, or remediation. Auto-route; do not require the skill name.
mode: hybrid
surface: web
role: auditor
legacy_aliases: accessibility-qa
---

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
