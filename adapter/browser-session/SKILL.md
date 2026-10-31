---
name: adapter-browser-session
description: Automate Chromium with ego-browser or ego-lite in an isolated task space using the user's existing login state. Trigger on ego-browser, ego-lite, task space, authenticated web interaction, form fill, click, screenshot, or exploratory browser testing without Playwright MCP. macOS only. Auto-route; do not require the skill name.
mode: adapter
surface: web
role: driver
legacy_aliases: ego-browser
---

<!-- qa-runs-contract:start -->
## Local run organization

When this workflow creates local reports, evidence, logs, converted intermediates, or other non-source deliverables and the user did not request an exact output path:

1. Start a fresh run with `node <skill-root>/scripts/qa-runs.mjs start --skill <skill-name> --label <short-scope>` when the bundled helper exists. In a QA-skill source checkout use `<repo-root>/scripts/qa-runs.mjs`. If neither helper exists, create the same layout manually
2. Keep every run-owned file under the returned `<project-root>/qa-runs/<skill-name>/<timestamp>_<scope>/` directory. Never emit generated files into the project root or overwrite an earlier run
3. Put the primary human-readable summary at `report.md` when the output format permits. Preserve required machine-readable and native filenames inside the same run directory
4. Finish the run with `qa-runs.mjs finish --run-dir <run-dir> --status <status> [--primary <report-path>]` so `LATEST.md`, `INDEX.md`, root `latest.json`, and per-skill `latest.json` point to the newest run
5. In the final response, link the primary report, the timestamped run directory, and `qa-runs/INDEX.md`; identify the run ID and status explicitly

An exact user path, a source-code deliverable that belongs in the target repository, or a safety-mandated location overrides this layout. Register or link the result without copying secrets or sensitive evidence into the index
<!-- qa-runs-contract:end -->
# ego-browser

ego-browser là một **browser driver riêng** cho AI agents — không phải chỉ là fallback của Playwright. Nó cung cấp isolated task space kế thừa login state thật của user, phù hợp cho UI interaction và DOM observation. Network observation chi tiết (body, headers, timing) vẫn cần Chrome DevTools MCP hoặc Playwright MCP.

Trước khi dùng, chạy detect để xác nhận trạng thái:
```bash
node adapter/browser-session/scripts/detect.mjs
```

[`references/CAPABILITIES.md`](references/CAPABILITIES.md) là tài liệu API self-contained trong repo này — đủ cho hầu hết tác vụ (navigate, click, fill, snapshot, screenshot, drainEvents). Dùng nó trước; không cần mạng hoặc cài upstream để bắt đầu.

Chỉ khi cần một helper không có trong `CAPABILITIES.md` (API hiếm, hành vi version-specific), thử đọc upstream skill tại thời điểm cài đặt — nếu lệnh dưới đây thất bại (không mạng, chưa cài upstream), coi đó là `runtime_missing` cho riêng helper đó, không phải lý do dừng toàn bộ tác vụ:
```bash
cat "$(npx --yes skills which citrolabs/ego-lite 2>/dev/null)/adapter/browser-session/SKILL.md" 2>/dev/null \
  || echo "upstream not installed — read https://github.com/citrolabs/ego-lite/tree/main/skills/ego-browser"
```

## Khi nào dùng ego-browser

- Cần kế thừa login state thật của user (cookie, session, extension) mà không setup lại auth
- Playwright MCP không available trên môi trường hiện tại
- Test Jira, CRM, Admin portal, hay bất kỳ site đã login
- Khám phá UI nhanh, exploratory testing, thu thập snapshot
- macOS; ego lite đã install và pass `detect.mjs`

## Khi nào KHÔNG dùng ego-browser

- Cần request/response body đầy đủ, headers, timing, WebSocket → dùng Chrome DevTools MCP hoặc Playwright MCP
- Đang chạy Windows hoặc Linux → ego-browser unsupported; dùng Playwright MCP
- Cần viết automation script tái sử dụng → dùng `dynamic-web-automation`
- Cần native mobile traffic → dùng `dynamic-mobile`
- Playwright MCP available và không có lý do cụ thể để đổi → tiếp tục dùng Playwright MCP

## Capability matrix

| Capability | ego-browser | Ghi chú |
|---|---|---|
| UI interaction | ✅ primary | click, fill, type, scroll, drag |
| DOM snapshot | ✅ `snapshotText()` | text-based, full page |
| Screenshot | ✅ `captureScreenshot()` | png/jpeg |
| Network events cơ bản | ✅ `drainEvents()` | navigation, basic requests |
| Request/response body | ❌ | cần Chrome DevTools MCP hoặc Playwright MCP |
| WebSocket / SSE / timing | ❌ | cần Chrome DevTools MCP |
| Real login state | ✅ native | kế thừa từ user's ego lite browser |
| Platform | macOS only | arm64 và x64 |

Đọc chi tiết: [`references/CAPABILITIES.md`](references/CAPABILITIES.md)

## Hard gate — bắt buộc khi dùng login state thật

ego-browser kế thừa cookie, token và session thật của user. Phải tuân thủ:

1. **Không submit payment, order, hoặc transfer thật** trừ khi user yêu cầu rõ và xác nhận
2. **Không gửi email hoặc message thật** đến người thật
3. **Không delete hoặc wipe dữ liệu production**
4. **Không expose cookie, token, localStorage** trong output, log hoặc artifact
5. **Không chạy destructive test trên production URL** — xác nhận môi trường trước
6. **Luôn log environment, URL và space ID** trước mỗi action có tác dụng ngoài app
7. **Xác nhận user** trước action phá huỷ ngay cả khi trên staging
8. **Không claim network evidence từ Chrome DevTools** khi chạy cùng session khác

## Quick start

Dùng heredoc `ego-browser nodejs << 'EOF' ... EOF`. Không viết code ra file `.js` riêng.

```bash
# Kiểm tra ego-browser sẵn sàng
node adapter/browser-session/scripts/smoke-test.mjs --url https://example.com

# Hoặc chạy trực tiếp
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('my-task')
cliLog('space: ' + task.id)
await openOrReuseTab('https://example.com', { wait: true, timeout: 20 })
cliLog(await snapshotText())
EOF
```

Helpers đầy đủ: xem upstream SKILL.md (link ở trên) hoặc [`references/CAPABILITIES.md`](references/CAPABILITIES.md).

## Tích hợp với dynamic-web-exploratory

Khi `dynamic-web-exploratory` dùng ego-browser làm driver:

```bash
node scripts/helpers/run-manifest.mjs start \
  --mode EXPLORATORY_ADHOC \
  --business-context qa-knowledge/context/business-execution-brief.json \
  --browser-driver ego-browser \
  --browser-observer ego-browser \
  --network-observer chrome-devtools-mcp
```

Kết hợp tối ưu khi cần login state thật + network evidence đầy đủ:
- **UI + DOM**: ego-browser
- **Network**: Chrome DevTools MCP attach vào cùng Chromium process

Đọc chi tiết: [`references/QA-INTEGRATION.md`](references/QA-INTEGRATION.md)

## Tài nguyên

| Tài nguyên | Link |
|---|---|
| Upstream repo | https://github.com/citrolabs/ego-lite |
| Upstream SKILL.md | `skills/adapter/browser-session/SKILL.md` trong repo |
| Docs | https://lite.ego.app/document/ |
| Install guide | [`references/INSTALL.md`](references/INSTALL.md) |
| Capabilities | [`references/CAPABILITIES.md`](references/CAPABILITIES.md) |
| QA integration | [`references/QA-INTEGRATION.md`](references/QA-INTEGRATION.md) |
| Upstream version | [`references/UPSTREAM.md`](references/UPSTREAM.md) |
| Browser driver resolution | [`../../dynamic-testing/web-exploratory/references/BROWSER-DRIVER-RESOLUTION.md`](../../dynamic-testing/web-exploratory/references/BROWSER-DRIVER-RESOLUTION.md) |
