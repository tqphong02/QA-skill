# Browser Driver Resolution

> Đọc file này khi: cần chọn browser driver hoặc network observer cho một QA run, hoặc khi debug tại sao evidence thiếu / sai session.

## 2-track resolution model

`browser-driver` và `network-observer` được resolve **độc lập**. Một track không phụ thuộc vào track kia.

## Default for generic and exploratory routes

`EXPLORATORY_BROWSER_QA` (including its `FAST` profile, labeled `BROWSER_TASK_FAST`, and its `EXPLORATORY_ADHOC` alias) plus `APP_BASELINE_DISCOVERY` default all three tracks to `playwright-runtime`. This is the bundled, versioned Playwright browser and does not open or attach to the user's system Google Chrome

Use an explicit `--browser-driver auto` (or `QA_BROWSER_DRIVER=auto`) only when the Chrome DevTools/Playwright MCP fallback policy is wanted. Explicit `--browser-driver`, `--browser-observer` and `--network-observer` values always win over the route default

```
Track A: browser_driver
  → Điều khiển UI interaction và DOM observation

Track B: network_observer
  → Thu thập network evidence
```

Có thể kết hợp bất kỳ combination hợp lệ:

| browser_driver | network_observer | Khi nào |
|---|---|---|
| chrome-devtools-mcp | chrome-devtools-mcp | Explicit Chrome DevTools driver and deep observability |
| playwright-mcp | playwright-mcp | Fallback, cross-platform, rich DOM automation |
| playwright-runtime | playwright-runtime | Bundled first-party Playwright/CDP runtime with AX tree, session daemon and isolated workers |
| ego-browser | chrome-devtools-mcp | macOS + real login + full network |
| ego-browser | ego-browser | macOS + real login + basic obs only |
| ego-browser | playwright-mcp | Không nên — khác session |
| playwright-mcp | chrome-devtools-mcp | Playwright UI + CDP deep network |
| chrome-devtools-mcp | chrome-devtools-mcp | Tab đang chạy, attach mode |
| antigravity host | playwright-runtime / playwright-mcp | Never use a host-provided browser |

## browser_driver — Resolution flow

```
Explicit auto fallback requested
        │
        ▼
Chrome DevTools MCP available AND can start or attach to Chrome?
  YES → Use chrome-devtools-mcp
  NO  ▼
Playwright MCP available?
  YES → Use playwright-mcp
  NO  ▼
Bundled playwright-runtime available and native session is allowed?
  YES → Use playwright-runtime
  NO  ▼
macOS AND ego-browser ready (detect.mjs exit 0)?
  YES → Use ego-browser
  NO  ▼
Mark browser_driver: unavailable

On Antigravity, stop at Playwright MCP/runtime; never use a host-provided browser
```

**Lưu ý quan trọng:**
- ego-browser là **browser driver riêng**, không phải chỉ là fallback của Playwright
- Chrome DevTools MCP là driver đầu tiên **chỉ trong policy `auto` được truyền rõ ràng**
- Route generic/exploratory không truyền driver sẽ dùng `playwright-runtime`; headless mode để Playwright chọn `chromium_headless_shell`, tránh mở app bundle Chrome trong Dock hoặc bật crash dialog và vẫn giữ browser binary cùng version với package Playwright
- Trên Windows/Linux: ego-browser unavailable → resolve sang playwright-mcp hoặc chrome-devtools-mcp

## network_observer — Resolution flow

```
Network evidence needed?
        │
        ▼
Resolved browser_driver is chrome-devtools-mcp?
  YES → Use chrome-devtools-mcp (same session)
  NO  ▼
Resolved browser_driver is playwright-mcp?
  YES → Use playwright-mcp (same session)
  NO  ▼
Resolved browser_driver is playwright-runtime?
  YES → Use runtime-observer attached to the native Playwright page (same session)
  NO  ▼
ego-browser is the browser_driver?
  YES → Use ego-browser / drainEvents() [basic events only, no body]
        Mark network assertions: reduced_confidence
  NO  ▼
Mark network_observer: unavailable
Mark BROWSER_OBSERVABILITY ledger: BLOCKED
Continue functional testing only if network not in contract
```

## Capability so sánh

| Capability | Native runtime | ego-browser | Playwright MCP | Chrome DevTools MCP |
|---|---|---|---|---|
| UI click / fill / navigate | ✅ | ✅ | ✅ | ⚠️ |
| DOM snapshot text | ✅ | ✅ | ✅ | ⚠️ |
| CDP Accessibility Tree | ✅ | ⚠️ | ⚠️ | ✅ |
| Stable target evidence | ✅ priority + uniqueness | ⚠️ | ✅ | ⚠️ |
| Screenshot | ✅ masked | ✅ | ✅ | ⚠️ |
| Network event list | ✅ same-session observer | ✅ drainEvents | ✅ | ✅ |
| **Request body** | ⚠️ not persisted | ❌ | ✅ | ✅ |
| **Response body** | ✅ redacted failure/GraphQL preview | ❌ | ✅ | ✅ |
| Response headers | ⚠️ observer scope | ❌ | ✅ | ✅ |
| Status code | ✅ | ⚠️ from events | ✅ | ✅ |
| WebSocket / SSE | ⚠️ lifecycle/errors | ❌ | ⚠️ | ✅ |
| Redirect chain | ⚠️ Playwright event scope | ❌ | ✅ | ✅ |
| Bounded recovery | ✅ stale-ref + safe reload budget | ⚠️ | ⚠️ | ⚠️ |
| Persistent session | ✅ daemon | ✅ native | tool-managed | attach-managed |
| Isolated worker pool | ✅ 1–4 workers | external | host-managed | host-managed |
| Real login state | ✅ storageState/profile/CDP | ✅ native | ❌ auth.json | ❌ attach |
| Cross-platform | ✅ | macOS only | ✅ | ✅ |

## Combination rules

### Rule 1 — Same-session network
Network evidence phải từ **cùng browser session** với UI action:
- Playwright MCP driver → dùng `browser_network_requests`, `browser_network_request`
- ego-browser driver → dùng `drainEvents()` hoặc attach Chrome DevTools vào cùng Chromium port
- Chrome DevTools driver → dùng `list_network_requests`, `get_network_request`

### Rule 2 — Không claim cross-session network
- ❌ Không dùng Chrome DevTools evidence cho Playwright session
- ❌ Không dùng Playwright evidence cho ego-browser session (trừ khi cùng Chromium port và đã verify)
- ❌ Không dùng drainEvents() để claim request/response body

### Rule 3 — Confidence marking
| network_observer | networkBody | Confidence |
|---|---|---|
| chrome-devtools-mcp + playwright-mcp (same session) | ✅ | high |
| playwright-mcp (driver = playwright-mcp) | ✅ | high |
| playwright-runtime (driver = playwright-runtime) | ✅ redacted failure/GraphQL preview | high |
| ego-browser (drainEvents only) | ❌ | medium |
| unavailable | N/A | low — keep the technical track unavailable; final exploratory result is `UNTEST` when the observer is required, otherwise `N/A` |

### Rule 4 — ego-browser + Chrome DevTools combination
Cấu hình tối ưu khi cần login state thật + full network:

```bash
node scripts/helpers/run-manifest.mjs start \
  --browser-driver ego-browser \
  --browser-observer ego-browser \
  --network-observer chrome-devtools-mcp
```

**Yêu cầu:**
1. ego lite app đang chạy
2. Chrome DevTools MCP configured và connected
3. CDP port của ego lite khớp với Chrome DevTools MCP target
4. Verify attach: `list_network_requests` trả về results từ đúng page

### Rule 5 — Platform fallback structured output

Khi ego-browser không available do platform:
```json
{
  "browser_driver": "unavailable",
  "reason": "unsupported_platform",
  "platform": "windows",
  "supported_platforms": ["darwin"],
  "fallback_resolved": "playwright-mcp"
}
```

## Run-manifest ledger

Mỗi run phải có ledger rows cho cả 3:

| Layer | Ledger key | Possible verdicts |
|---|---|---|
| browser_driver | `BROWSER_DRIVER` | PASS / FAILED / BLOCKED |
| browser_observer | `BROWSER_OBSERVER` | PASS / FAILED / BLOCKED |
| network_observer | `NETWORK_OBSERVER` | PASS / FAILED / BLOCKED / PARTIAL(reduced_confidence) |

## browser-evidence.json schema

```json
{
  "driver": "ego-browser",
  "platform": "darwin",
  "spaceId": "dynamic-web-exploratory-001",
  "url": "https://app.example.com/feature",
  "environment": "staging",
  "timestamp": "2026-07-31T05:00:00Z",
  "capabilities": {
    "interaction": true,
    "domSnapshot": true,
    "screenshot": true,
    "networkSummary": true,
    "networkBody": false
  },
  "networkObserver": "chrome-devtools-mcp",
  "evidence": {
    "snapshot": "evidence/runs/<run-id>/snapshot.txt",
    "screenshot": "evidence/runs/<run-id>/screenshot.png",
    "networkEvents": "evidence/runs/<run-id>/network-events.json"
  },
  "confidence": "high"
}
```
