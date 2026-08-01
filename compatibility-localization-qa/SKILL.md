---
name: compatibility-localization-qa
description: Build and validate browser, device, operating-system, locale, timezone, currency, text-expansion, and RTL compatibility coverage for web or mobile releases. Trigger on browser compatibility, device matrix, cross-browser, responsive support, i18n, l10n, locale, timezone, currency, RTL, translation, Unicode, or regional formatting; do not require the skill name. Use qa-run or mobile-qa for live execution after the matrix is approved.
---

# Compatibility & Localization QA

Prevent a green single-browser test from hiding failures in another browser, viewport, locale, timezone, currency, or writing direction. This skill validates coverage design and evidence contracts; live browser/device actions belong to `qa-run` or `mobile-qa`.

## Workflow

1. Resolve supported browsers, devices, OS versions, locales, timezones, currencies, and RTL policy from requirements
2. Build a risk-based matrix and include text expansion, Unicode, date/number formatting, keyboard, viewport, and network variation where relevant
3. Validate the matrix locally with `check_compatibility_matrix.py`
4. Execute approved shards through the matching browser/mobile skill and retain screenshot/video evidence per result
5. Compare expected translations and formats with source requirements; do not silently accept fallback English or clipped text

```bash
python3 compatibility-localization-qa/scripts/check_compatibility_matrix.py compatibility.json
```

## Hard gates

- Missing supported-platform source, locale list, expected format, or target is `BLOCKED`
- A matrix is not coverage merely because it lists browsers; each required dimension needs at least one executable case
- If the product supports RTL, include an RTL locale and visual evidence; if RTL is out of scope, record that decision explicitly
- Do not change locale, account data, device state, or application content outside the approved test boundary
- Keep translation defects, rendering defects, and browser-engine defects separately classified

## Output contract

Return pretty JSON with `passed`, `errors`, `warnings`, `dimensions`, `coverage`, `cases`, and `limitations`. Each case preserves browser/device/locale/timezone identity and has an evidence reference when executed. A plan without runtime evidence is `READY`, not an execution `PASS`.

## References

- [Compatibility matrix](references/COMPATIBILITY_MATRIX.md)
- [Deterministic matrix checker](scripts/check_compatibility_matrix.py)
