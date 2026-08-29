---
name: dynamic-compatibility
description: Validate browser, device, OS, viewport, locale, timezone, currency, text expansion, Unicode, and RTL compatibility. Trigger on Chrome/Safari/Firefox/Edge versions, cross-browser, responsive matrices, Android/iOS, i18n, l10n, translations, or regional formatting. Auto-route; do not require the skill name.
mode: dynamic
surface: compatibility
role: validator
legacy_aliases: compatibility-localization-qa
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
# Compatibility & Localization QA

Prevent a green single-browser test from hiding failures in another browser, viewport, locale, timezone, currency, or writing direction. This skill validates coverage design and evidence contracts; live browser/device actions belong to `dynamic-web-exploratory` or `dynamic-mobile`.

## Workflow

1. Resolve supported browser vendors and versions, browser engines, devices, OS versions, exact viewports/resolutions, locales, timezones, currencies, and RTL policy from requirements
2. Build a risk-based matrix and include text expansion, Unicode, date/number formatting, keyboard, orientation, device pixel ratio, viewport, and network variation where relevant
3. Validate the matrix locally with `check_compatibility_matrix.py`
4. Execute approved shards through the matching browser/mobile skill and retain screenshot/video evidence per result
5. Compare expected translations and formats with source requirements; do not silently accept fallback English or clipped text

For a web smoke runner, `dynamic-testing/web-exploratory/scripts/helpers/compat.mjs --matrix <matrix.json>` consumes the v2 executable cases and applies their viewport, locale and timezone. It records browser vendor/version and target OS metadata, but does not virtualize an operating system; exact OS/vendor claims require the matching browser channel, CI host or device service

```bash
python3 dynamic-testing/compatibility/scripts/check_compatibility_matrix.py compatibility.json
```

## Hard gates

- Missing supported-platform source, locale list, expected format, or target is `BLOCKED`
- A matrix is not coverage merely because it lists browsers; each required dimension needs at least one executable case
- A release matrix should use `matrix_version: 2` with `browser_profiles`, `os_versions`, `viewports`, `required_browser_vendors`, and `required_devices`
- Map Chrome and Edge to Chromium, and Safari to WebKit only as an engine baseline; do not claim exact vendor/version coverage without the named browser channel or a real browser/device service
- Declare tablet, desktop resolutions, orientation and OS/browser pairs explicitly when they are supported; an emulator or user-agent string alone is not real-device evidence
- If the product supports RTL, include an RTL locale and visual evidence; if RTL is out of scope, record that decision explicitly
- Do not change locale, account data, device state, or application content outside the approved test boundary
- Keep translation defects, rendering defects, and browser-engine defects separately classified

## Output contract

Return pretty JSON with `passed`, `errors`, `warnings`, `dimensions`, `coverage`, `cases`, and `limitations`. Each case preserves browser/device/locale/timezone identity and has an evidence reference when executed. A plan without runtime evidence is `READY`, not an execution `PASS`.

## References

- [Compatibility matrix](references/COMPATIBILITY_MATRIX.md)
- [Deterministic matrix checker](scripts/check_compatibility_matrix.py)
