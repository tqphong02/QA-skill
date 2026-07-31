# ego-browser — QA Integration

File này mô tả cách qa-run gọi ego-browser, artifact layout, và cách kết hợp với Chrome DevTools MCP.

## Driver resolution trong qa-run

qa-run resolve driver và observer **độc lập** theo 2 track:

```yaml
browser_driver:
  purpose: Điều khiển UI interaction
  priority:
    1: playwright-mcp       # cross-platform, rich obs cùng session
    2: ego-browser          # macOS + real login state
    3: chrome-devtools-mcp  # khi tab đang chạy cần attach
    4: antigravity-native   # Gemini-in-Chrome, last resort
    5: unavailable

network_observer:
  purpose: Thu thập network evidence
  priority:
    1: chrome-devtools-mcp  # body, headers, timing, WebSocket, full detail
    2: playwright-mcp       # body + status khi cùng session driver
    3: ego-browser          # drainEvents() — basic events, reduced confidence
    4: unavailable
```

Đọc chi tiết flowchart và combination rules:
[`../qa-run/references/BROWSER-DRIVER-RESOLUTION.md`](../../qa-run/references/BROWSER-DRIVER-RESOLUTION.md)

## run-manifest.mjs flags

```bash
node scripts/helpers/run-manifest.mjs start \
  --mode <MODE> \
  --business-context qa-knowledge/context/business-execution-brief.json \
  --browser-driver <auto|playwright-mcp|ego-browser|chrome-devtools-mcp|antigravity-native|unavailable> \
  --browser-observer <auto|playwright-mcp|ego-browser|chrome-devtools-mcp|unavailable> \
  --network-observer <auto|chrome-devtools-mcp|playwright-mcp|ego-browser|unavailable>
```

Ví dụ — ego-browser driver + Chrome DevTools network:
```bash
node scripts/helpers/run-manifest.mjs start \
  --mode EXPLORATORY_ADHOC \
  --business-context qa-knowledge/context/business-execution-brief.json \
  --browser-driver ego-browser \
  --browser-observer ego-browser \
  --network-observer chrome-devtools-mcp
```

## Artifact layout chuẩn

Evidence từ ego-browser session phải được ghi vào artifact layout sau:

```text
evidence/runs/<run-id>/
├── browser-evidence.json       ← manifest (xem schema bên dưới)
├── snapshot.txt                ← output của snapshotText()
├── screenshot.png              ← output của captureScreenshot()
├── console-events.json         ← console errors / warnings từ drainEvents()
└── network-events.json         ← network events từ drainEvents() (basic)
```

### browser-evidence.json schema

```json
{
  "driver": "ego-browser",
  "platform": "darwin",
  "spaceId": "qa-checkout-001",
  "url": "https://app.example.com/checkout",
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
  "confidence": "medium"
}
```

**Confidence levels:**
- `high`: driver + network observer cùng session, body available
- `medium`: driver có login state thật, network summary only (ego drainEvents)
- `low`: fallback driver, không có network obs

## Capture snapshot và screenshot

```bash
ego-browser nodejs <<'EOF'
const fs = require('fs')
const path = require('path')

const task = await useOrCreateTaskSpace('qa-run-task')
await openOrReuseTab(process.env.QA_TARGET_URL, { wait: true, timeout: 30 })

// Snapshot
const snap = await snapshotText()
fs.writeFileSync('evidence/runs/current/snapshot.txt', snap)

// Screenshot
const shot = await captureScreenshot({ format: 'png' })
// shot là path tạm — copy sang evidence dir
cliLog(JSON.stringify({ snapshot: 'evidence/runs/current/snapshot.txt', screenshot: shot }))
EOF
```

## Kết hợp ego-browser + Chrome DevTools MCP

Khi cần UI với login state thật + network evidence đầy đủ:

1. **Khởi động ego-browser session** trước:
   ```bash
   ego-browser nodejs <<'EOF'
   const task = await useOrCreateTaskSpace('qa-network-test')
   await openOrReuseTab('https://app.example.com', { wait: true })
   cliLog('space-id: ' + task.id)
   EOF
   ```

2. **Attach Chrome DevTools MCP** vào cùng Chromium port
   - ego lite expose CDP trên `localhost:<port>` — xác nhận port trong ego lite Settings hoặc qua `detect.mjs`
   - Dùng Chrome DevTools MCP tools (`list_network_requests`, `get_network_request`) cho network evidence

3. **Thực hiện UI action** qua ego-browser, collect network qua Chrome DevTools

4. **Verify**: network evidence phải từ cùng page/session với UI action

## Khi nào chỉ cần ego-browser (không cần Chrome DevTools)

- Exploratory testing: click around, chụp snapshot, không cần verify API
- Thu thập UI state nhanh cho logged-in page
- Test flow đơn giản không có API contract
- Khi Chrome DevTools MCP không available → đặt `network_observer: ego-browser`, ghi confidence `medium`

## Output chuẩn về artifact registry

Sau mỗi ego-browser session, tạo `browser-evidence.json` và pass vào collect-evidence:

```bash
node scripts/helpers/collect-evidence.mjs \
  --browser-evidence evidence/runs/<run-id>/browser-evidence.json \
  --run-id <run-id>
```

## Observation rules (ego-browser session)

- `drainEvents()` phải được gọi **sau** mỗi business transition (submit, save, navigate)
- Không dùng `drainEvents()` output từ ego-browser để claim network body evidence
- Nếu Chrome DevTools network observer không available: mark network assertion là `reduced_confidence`
- Screenshot phải tồn tại trước khi mark testcase `Pass` hoặc `Fail`
