# Mobile device matrix

Choose risk-based representatives rather than every possible device.

| Dimension | Minimum consideration |
|---|---|
| Platform | every supported Android and iOS family |
| OS | minimum supported, dominant current, latest supported |
| Screen | small phone, common phone, large phone, tablet when supported |
| Hardware | lower resource class and current flagship class |
| Runtime | emulator or simulator for breadth, real device for release-critical paths |
| Locale | default plus long-text or non-Latin locale when relevant |
| Theme | light, dark, high contrast where supported |
| Network | normal, slow, intermittent, offline, recovery |
| Lifecycle | clean install, upgrade, background, terminate, restart |
| Accessibility | font scaling, screen reader, switch or keyboard where supported |

## Required run record

Record the resolved matrix before execution:

| Field | Resolved value |
|---|---|
| Build and checksum | |
| Environment | |
| Platform and OS | |
| Device model/class | |
| Real, emulator, or simulator | |
| Orientation, locale, theme | |
| Network states | |
| Install/upgrade state | |
| Lifecycle transitions | |
| Accessibility settings | |

Use at least one real device for release-critical flows unless the user explicitly accepts virtual-only coverage. Keep unexecuted combinations visible.

## Lifecycle scope

Choose explicitly from clean install, upgrade, first launch, warm launch, cold launch, background/foreground, process termination, device restart, permission revocation/recovery, network loss/recovery, app-data reset, and uninstall cleanup.

## Locator priority

1. Accessibility ID
2. Android resource ID or iOS stable predicate
3. Visible label with stable semantics
4. Scoped XPath only when no stable identifier exists
5. Coordinates only for a documented platform gesture fallback
