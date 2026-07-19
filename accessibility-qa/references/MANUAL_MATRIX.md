# Accessibility manual matrix

| Area | Checks |
|---|---|
| Keyboard | skip link, logical Tab and Shift+Tab order, Enter and Space activation, arrow-key pattern, Escape, no trap |
| Focus | visible indicator, focus on open, containment in modal, return on close, preserved after validation |
| Structure | page title, language, landmarks, one meaningful H1, logical heading hierarchy, lists and tables |
| Name and state | accessible name, role, value, expanded, selected, pressed, disabled, required |
| Forms | persistent labels, instructions, autocomplete, error summary, field error association, recovery |
| Dynamic content | loading, toast, status, validation, dialog title, live-region announcement |
| Visual | 200% zoom, 320px reflow, text spacing, contrast, non-text contrast, target size, orientation |
| Media | captions, transcript, audio description when required, pause or stop controls |
| Cognitive | consistent navigation, clear labels, timeout warning, error prevention, no unexpected context change |
| Screen reader | reading order, rotor or element list, names, states, instructions, errors, live updates |

## Evidence rules

- Capture the smallest screenshot or recording that proves the visual or focus issue
- Record exact keys used for keyboard reproduction
- Record actual spoken output only when heard from the named screen reader
- Keep axe rule output as structured JSON and summarize affected nodes
- Treat `incomplete` as manual review required, not PASS
