# UI/UX review matrix

Use the matrix to separate design intent from implementation observation.

| Area | Minimum question | Evidence |
|---|---|---|
| Structure | Are regions, hierarchy and primary action in the expected order | requirement ID and screenshot |
| Visual | Are spacing, typography, color and tokens consistent with the source | design reference and viewport capture |
| State | Are loading, validation, error, empty and success states understandable | state-specific media |
| Responsive | Does content reflow without clipping or hidden actions | desktop and mobile captures |
| Interaction | Is feedback, disabled state and focus order predictable | interaction recording or same-session trace |
| Accessibility handoff | Are contrast, semantics, keyboard and focus checked by the a11y skill | a11y report ID |

Classify a mismatch as `design`, `requirement`, `implementation`, `runtime`, or `unknown` before filing it
