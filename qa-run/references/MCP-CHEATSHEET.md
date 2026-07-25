# QA Run — MCP Playwright Cheatsheet & Speed Optimization

> Read this file when: choosing which MCP/Playwright tool to use for a specific task, or optimizing speed and intelligence of browser interactions.

## MCP Playwright Tool Reference

| Task | Method |
|---|---|
| Open page | `browser_navigate` |
| View interactive DOM (headings, buttons, inputs, toasts, console err, HTTP>=400) | `browser_snapshot` |
| Click button / link / text | `browser_click` |
| Fill form | `browser_fill_form` or `browser_type` |
| Run arbitrary JS (probe API, read state) | `browser_evaluate` |
| Wait for text / state | `browser_wait_for` stable text (no hard `wait_for_timeout`) |
| Test multiple pages / endpoints | `browser_tabs` (open in parallel) |
| View network + console | `browser_network_requests` / `browser_console_messages` |
| Compare baseline | `browser_take_screenshot` (when pixel comparison is needed) |

## Speed Optimization (Reduce Round-trips & Payload)

| Pattern | Instead of | Benefit |
|---|---|---|
| Scope snapshot | snapshot full page | Small payload 5-20x |
| Batch fill | multiple `browser_type` | 3 round-trips -> 1 |
| Batch evaluate | N times `browser_evaluate` | 1 round-trip |
| Wait deterministic | `wait_for_timeout` hard | No redundant waiting |
| Parallel tabs | sequential navigate | Parallel probe |
| Block heavy resource | load full assets | 2-5x faster |
| Reuse context | login per probe | Skip login |

## Intelligence Patterns

1. **Heuristic checklist by feature type** — Form/Table/Filter/Auth/Modal/Async/Data
2. **Cross-verify (DO NOT only trust snapshot)** — DOM + network + console ≥ 2 sources
3. **Pattern memory** — read matching feature business guide first, then `FINDINGS.md` + related evidence when needed
4. **Parallel agent fan-out** — 3-5 agents probe simultaneously (only when user opts in)
5. **Charter with risk taxonomy** — H/M/L priority probe first
6. **Screenshot-first evidence** — prioritize `visual-evidence-router.mjs` / OmniParser to ground elements, labels and bounding boxes first; only fallback to OCR or general vision when OmniParser is unavailable or exact characters need extracting; do not convert whole PNG/JPG to markdown

## When to Use MCP vs Scripts

| Situation | Use |
|---|---|
| Interactive branch not yet understood | MCP Playwright (interactive) |
| Clear repetitive flow | CLI scripts (`node scripts/x.mjs`) |
| Regression / recurring CI run | `run.mjs` + `cases.mjs` data-driven |
| Visual layout verification | `visual-audit.mjs` → read JSON → view screenshots |
| Form mutation/attack injection | `attack-surface.mjs` (0 tokens) |
| Exploratory checklist generation | `generate-checklist.mjs` → mark [x]/[ ] |

## Screenshot & Image Evidence Rules

- Use screenshot as the direct source of truth for UI state; do not force-convert to text before analyzing
- If the image is a flow/UI screenshot, prioritize `visual-audit.mjs`, `visual-evidence-router.mjs` or an image viewer to ground elements, labels and layout
- Only convert image to text when needing OCR for image content (text on banner, toast, modal, QR) or when DOM/network is not enough to verify
- Do not save images as intermediate text files unless necessary — it loses visual context
