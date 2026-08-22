# QA Run — Antigravity Playwright Policy & Common Mistakes

> Read this file when running the skill from Antigravity or debugging browser workflow mistakes.

## 2-track browser capability model

`browser_driver` và `network_observer` được resolve **độc lập**. Đọc chi tiết flowchart: [BROWSER-DRIVER-RESOLUTION.md](BROWSER-DRIVER-RESOLUTION.md)

### browser_driver priority

Generic/exploratory routes default to the bundled `playwright-runtime`. On Antigravity, do not use `--browser-driver auto` or a host browser

```
Playwright MCP → bundled playwright-runtime → unavailable
```

- **Playwright MCP**: fallback driver; cross-platform; rich obs cùng session
- **bundled playwright-runtime**: local Playwright browser with same-session evidence
- **unavailable**: mark BROWSER_DRIVER ledger BLOCKED and the user-facing result `UNTEST`

### network_observer priority

```
Resolved driver observer → verified same-session observer → ego-browser (basic) → unavailable
```

- **Chrome DevTools MCP**: body, headers, timing, WebSocket — full detail
- **Playwright MCP**: body + status khi cùng session với driver
- **ego-browser drainEvents()**: basic navigation/network events; không có body; mark `reduced_confidence`
- **unavailable**: mark NETWORK_OBSERVER ledger BLOCKED

Kết hợp tốt nhất khi cần login thật + full network: `ego-browser` driver + `chrome-devtools-mcp` observer

## Google Antigravity Playwright policy

Antigravity/Gemini is a host model only. Every UI action, DOM/AX observation, screenshot and same-session event must use the bundled `playwright-runtime` or `playwright-mcp` from the project terminal. `Gemini-in-Chrome`, `antigravity-native` and other host browser tools are prohibited. If Playwright is unavailable, mark the browser driver `unavailable` and return `UNTEST`

### Portable assets (runs in any env with Node >= 18)

| Asset | Portability Reason |
|---|---|
| `lib/driver.mjs`, `lib/ui.mjs`, `lib/assert.mjs` | Pure Node + playwright npm |
| `scripts/sweep.mjs`, `api-health.mjs`, `explore.mjs`, `login.mjs` | Pure Node, call `node <script>` |
| `scripts/log-bug.mjs` | Pure `fetch` HTTP → Plane API |
| `report/export-pdf.sh`, `report/upload-to-drive.py` | Bash/Python stdlib |
| Principle #1 (understand context first), 5 testing techniques, retest/sanity workflow | **Methodology** — tool-independent |
| `.env`, `auth.json`, `evidence/` | Located in project folder, DOES NOT depend on Claude Code |

### Required UI-driving path

| Task | Required Playwright path |
|---|---|
| **UI interaction** | `native-browser-runtime.mjs` / `playwright-mcp` |
| **DOM/AX snapshot** | runtime `observe` / `browser_snapshot` |
| **Screenshot** | runtime screenshot / `browser_take_screenshot` |
| **Network events** | Same-session Playwright observer; use Chrome DevTools only as an attached observer when required |
| **Login state** | Playwright `auth.json` or Playwright storage state |
| Fetch ticket from URL | `WebFetch` or `node` helper; browser UI still uses Playwright |
| Run probe script | `node scripts/x.mjs` via the project terminal |
| Log bug | Plane browser editor driven by Playwright |

### Workflow on Antigravity
1. Open Antigravity IDE -> open project folder (e.g. `MyProject/qa/`)
2. Agent (Gemini) invokes the skill's `playwright-runtime` from the project terminal for UI actions, DOM/AX observation, screenshots and same-session evidence
3. Do not open or use Gemini-in-Chrome; resolve `playwright-runtime` or `playwright-mcp`, otherwise return `UNTEST`
4. When needing batch/regression -> agent runs `node <skill-root>/scripts/sweep.mjs`
5. When logging a bug with evidence -> agent opens the exact Plane ticket in the authenticated browser editor and pastes the image inline; the helper remains text-only by default
6. Verdict + report in same format (`report/REPORT-TEMPLATE.md`)

Before claiming an Antigravity smoke PASS, save a redacted JSON result with
`host: "antigravity"`, `browser_driver: "playwright-runtime"`,
`same_session: true`, `screenshot_paths` pointing to existing files, and true
`network_observed`, `console_observed` and `page_errors_observed` fields, then
validate it:

```bash
node scripts/helpers/validate-host-smoke.mjs --result evidence/antigravity-smoke.json
```

The validator is a fail-closed evidence gate. It does not pretend to run
Antigravity; a host without a live smoke artifact remains `BLOCKED`

### Notes on fallback
- `auth.json` must exist when the project Playwright runtime needs an authenticated session
- Antigravity smoke evidence is valid only when the browser driver is `playwright-runtime` or `playwright-mcp`
- Different model prompt: Gemini must be told to invoke the Playwright skill runtime from the terminal, not to open its own browser

## Common Mistakes

| Mistake | Why it's wrong | Fix |
|---|---|---|
| Blind clicking without reading spec | AI generates wrong verdict (mistaking PASS for FAILED or vice versa) | MANDATORY to go through Step A-D in [PROCESS-GUIDE.md](PROCESS-GUIDE.md) |
| Skip adjacent area check | Functional fixes sometimes break UI elsewhere | Step 4 (RETEST_PLUS) is MANDATORY |
| Snapshot full page every time | Large payload, wastes tokens | Scope snapshot — only interactive elements |
| Use hard `wait_for_timeout` | Flaky CI | Always `browser_wait_for` text/event |
| Hardcode URL/auth in prompt | Secret leak | Use `.env` + `auth.json` in project folder |
| Skip teardown | DB pollution, affects other tests | Wrap in `withRevert()` or use `afterAll` |
| Not writing business guide after run | AI has to re-explore from scratch next time | Always merge valid knowledge, write guide and validate read-back |
| Absolute trust in old guides | Environment/version can change | Check verify date, source and confidence then re-verify parts within current scope |
| Lumped "overall OK" verdict | Hides individual failed ACs | MUST mark PASS/FAILED per AC |
| Image in Plane bug appears as an attachment | Used the ticket-level Attach control or API attachment route | Paste it in the authenticated browser editor and verify `Attachments 0` |
| `Cannot find .env` | Wrong cwd | `cd ~/Documents/QA-MDS/<project>` before running |
| `401 Unauthorized` (Plane) | Wrong/expired API key | Rotate key in Plane Profile |
| Skill not appearing | Folder in wrong location | Run `scripts/doctor-agent.sh --agent=<host>` from repository then open new agent session |
| ego-browser drainEvents used as network body evidence | drainEvents has no request/response body | Use Chrome DevTools MCP as network_observer for body/headers |
| ego-browser on Windows/Linux | Unsupported platform — CLI not found | Run detect.mjs; fallback to playwright-mcp or chrome-devtools-mcp |
| Claiming Chrome DevTools network evidence for ego-browser session | Different Chromium process or port | Verify CDP port matches ego lite; only then attach Chrome DevTools MCP |
| Skipping detect.mjs before ego-browser task | App may not be running | Always run `node adapter/browser-session/scripts/detect.mjs` first |
