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
| View Playwright network list | `browser_network_requests` |
| Inspect one Playwright request/response | `browser_network_request` |
| View Playwright console | `browser_console_messages` |
| View Chrome DevTools network list | `list_network_requests` |
| Inspect one Chrome DevTools request/response | `get_network_request` |
| View Chrome DevTools console | `list_console_messages` / `get_console_message` |
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

## Same-session network rule — 2-track model

`browser_driver` và `network_observer` được resolve độc lập. Network evidence phải từ đúng session tương ứng:

| browser_driver | network_observer hợp lệ | Tool |
|---|---|---|
| Playwright MCP | playwright-mcp | `browser_network_requests`, `browser_network_request`, `browser_console_messages` |
| Playwright MCP | chrome-devtools-mcp | `list_network_requests`, `get_network_request` (attach đúng tab) |
| ego-browser | ego-browser | `drainEvents()` — basic events, no body; mark `reduced_confidence` |
| ego-browser | chrome-devtools-mcp | `list_network_requests`, `get_network_request` (attach CDP port ego lite) |
| chrome-devtools-mcp | chrome-devtools-mcp | `list_network_requests`, `get_network_request`, `list_console_messages` |
| script (playwright-runtime) | script | attach `scripts/helpers/runtime-observer.mjs` |

**Cross-session vi phạm (never):**
- ❌ ego-browser driver + Chrome DevTools observer khi chưa verify CDP port match
- ❌ Playwright MCP network evidence cho action thực thi trong ego-browser
- ❌ drainEvents() output để claim request/response body
- ❌ Chrome DevTools MCP của browser khác session để làm network evidence

**ego-browser network confidence:**
- `drainEvents()` only → `reduced_confidence` — chỉ phù hợp cho exploratory, không phù hợp cho network contract test
- Muốn body/headers → attach `chrome-devtools-mcp` vào cùng Chromium process của ego lite

Một 4xx/5xx là candidate cho đến khi có correlation với triggering action, expected behavior, response body và UI impact

## When to Use: driver và observer

### browser_driver

| Tình huống | Driver |
|---|---|
| Cross-platform, rich obs, default | playwright-mcp |
| macOS + cần login state thật | ego-browser |
| Playwright MCP unavailable, macOS | ego-browser |
| Attach vào tab đang chạy | chrome-devtools-mcp |
| ego-browser không available (Windows/Linux/not installed) | playwright-mcp → chrome-devtools-mcp → antigravity-native |

### network_observer

| Khi cần | Observer |
|---|---|
| Request/response body, headers, timing đầy đủ | chrome-devtools-mcp |
| Playwright đang làm driver cùng session | playwright-mcp |
| Exploratory, không cần body | ego-browser (mark reduced_confidence) |
| Không có observer nào available | unavailable — mark BLOCKED nếu network là part of contract |

### Scripts

| Tình huống | Dùng |
|---|---|
| Clear repetitive flow | CLI scripts (`node scripts/x.mjs`) |
| Regression / recurring CI run | `run.mjs` + `cases.mjs` data-driven |
| Visual layout verification | `visual-audit.mjs` → read JSON → view screenshots |
| Form mutation/attack injection | `attack-surface.mjs` (0 tokens) |
| Exploratory/ad-hoc planning | `prepare-test-intelligence.mjs` → ranked charters |
| UI inventory for active charter | `generate-checklist.mjs` → scoped checklist |

## Screenshot & Image Evidence Rules

- Use screenshot as the direct source of truth for UI state; do not force-convert to text before analyzing
- If the image is a flow/UI screenshot, prioritize `visual-audit.mjs`, `visual-evidence-router.mjs` or an image viewer to ground elements, labels and layout
- Only convert image to text when needing OCR for image content (text on banner, toast, modal, QR) or when DOM/network is not enough to verify
- Do not save images as intermediate text files unless necessary — it loses visual context
