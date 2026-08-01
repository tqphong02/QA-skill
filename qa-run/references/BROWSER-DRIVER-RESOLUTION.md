# Browser Driver Resolution

> Đọc file này khi: cần chọn browser driver hoặc network observer cho một QA run, hoặc khi debug tại sao evidence thiếu / sai session.

## 2-track resolution model

`browser-driver` và `network-observer` được resolve **độc lập**. Một track không phụ thuộc vào track kia.

```
Track A: browser_driver
  → Điều khiển UI interaction và DOM observation

Track B: network_observer
  → Thu thập network evidence
```

Có thể kết hợp bất kỳ combination hợp lệ:

| browser_driver | network_observer | Khi nào |
|---|---|---|
| chrome-devtools-mcp | chrome-devtools-mcp | Default Chrome-first driver and deep observability |
| playwright-mcp | playwright-mcp | Fallback, cross-platform, rich DOM automation |
| ego-browser | chrome-devtools-mcp | macOS + real login + full network |
| ego-browser | ego-browser | macOS + real login + basic obs only |
| ego-browser | playwright-mcp | Không nên — khác session |
| playwright-mcp | chrome-devtools-mcp | Playwright UI + CDP deep network |
| chrome-devtools-mcp | chrome-devtools-mcp | Tab đang chạy, attach mode |
| antigravity-native | unavailable | Last resort |

## browser_driver — Resolution flow

```
Browser task requested
        │
        ▼
Chrome DevTools MCP available AND can start or attach to Chrome?
  YES → Use chrome-devtools-mcp
  NO  ▼
Playwright MCP available?
  YES → Use playwright-mcp
  NO  ▼
macOS AND ego-browser ready (detect.mjs exit 0)?
  YES → Use ego-browser
  NO  ▼
Antigravity native browser available?
  YES → Use antigravity-native
  NO  ▼
Mark browser_driver: unavailable
```

**Lưu ý quan trọng:**
- ego-browser là **browser driver riêng**, không phải chỉ là fallback của Playwright
- Chrome DevTools MCP là driver mặc định khi có thể khởi động hoặc attach Chrome
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
ego-browser is the browser_driver?
  YES → Use ego-browser / drainEvents() [basic events only, no body]
        Mark network assertions: reduced_confidence
  NO  ▼
Mark network_observer: unavailable
Mark BROWSER_OBSERVABILITY ledger: BLOCKED
Continue functional testing only if network not in contract
```

## Capability so sánh

| Capability | ego-browser | Playwright MCP | Chrome DevTools MCP |
|---|---|---|---|
| UI click / fill / navigate | ✅ | ✅ | ⚠️ |
| DOM snapshot text | ✅ | ✅ | ⚠️ |
| Screenshot | ✅ | ✅ | ⚠️ |
| Network event list (basic) | ✅ drainEvents | ✅ | ✅ |
| **Request body** | ❌ | ✅ | ✅ |
| **Response body** | ❌ | ✅ | ✅ |
| Response headers | ❌ | ✅ | ✅ |
| Status code | ⚠️ from events | ✅ | ✅ |
| WebSocket / SSE | ❌ | ⚠️ | ✅ |
| Redirect chain | ❌ | ✅ | ✅ |
| Performance timing | ❌ | ⚠️ | ✅ |
| Real login state | ✅ native | ❌ auth.json | ❌ attach |
| Cross-platform | macOS only | ✅ | ✅ |

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
| ego-browser (drainEvents only) | ❌ | medium |
| unavailable | N/A | low — mark BLOCKED |

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
  "spaceId": "qa-run-001",
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
