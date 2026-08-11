---
name: dynamic-compatibility
description: Validate browser, device, OS, viewport, locale, timezone, currency, text expansion, Unicode, and RTL compatibility. Trigger on Chrome/Safari/Firefox/Edge versions, cross-browser, responsive matrices, Android/iOS, i18n, l10n, translations, or regional formatting. Auto-route; do not require the skill name.
mode: dynamic
surface: compatibility
role: validator
legacy_aliases: compatibility-localization-qa
---

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
