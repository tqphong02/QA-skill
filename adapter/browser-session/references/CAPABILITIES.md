# ego-browser — Capabilities

File này mô tả 3 capability riêng biệt của ego-browser và giới hạn của từng cái trong context QA-skill.

## 3 vai trò của browser driver

| Vai trò | Mô tả | ego-browser | Playwright MCP | Chrome DevTools MCP |
|---|---|---|---|---|
| **browser_driver** | Điều khiển UI: click, fill, navigate, scroll | ✅ primary | ✅ primary | ⚠️ limited (CDP) |
| **browser_observer** (DOM) | Đọc trạng thái trang: snapshot, screenshot | ✅ | ✅ | ⚠️ via CDP |
| **network_observer** | Thu thập request/response | ⚠️ basic only | ✅ body + status | ✅ full detail |

> ego-browser phù hợp tốt với 2 vai trò đầu. Vai trò network_observer ở mức cơ bản.

## browser_driver capability

| Hành động | ego-browser API | Ghi chú |
|---|---|---|
| Navigate | `openOrReuseTab(url, opts)`, `gotoUrl(url)` | Reuse tab nếu URL match |
| Click | `click({ text, selector, ... })` | Text-based hoặc selector |
| Fill input | `fillInput(selector, value)` | Thay thế nội dung |
| Type text | `typeText(text)` | Nhập từng ký tự |
| Press key | `pressKey(key)` | Enter, Tab, Escape, ... |
| Scroll | `scrollBy(x, y)`, `scrollToBottomUntil(cond)` | |
| Upload file | `uploadFile(selector, path)` | |
| Run JS | `js(expression)` | Evaluate trong browser context |
| CDP raw | `cdp(method, params)` | Chrome DevTools Protocol trực tiếp |

## browser_observer (DOM/visual) capability

| Capability | ego-browser API | Output |
|---|---|---|
| Text snapshot | `snapshotText()` | Text của toàn trang (interactive elements) |
| Screenshot | `captureScreenshot({ format })` | Path đến file PNG/JPEG |
| Page info | `pageInfo()` | `{ url, title, w, h, sx, sy, pw, ph }` |
| Wait for element | `waitForElement(selector, opts)` | |
| Wait for load | `waitForLoad()`, `waitForNetworkIdle()` | |

### Giới hạn DOM observation

- `snapshotText()` là text-based, không phải DOM tree cấu trúc — không phù hợp cho selector-based assertion
- Iframe nội dung: behavior phụ thuộc vào ego-browser version; xác nhận bằng `smoke-test.mjs`
- Shadow DOM: dùng `js()` kết hợp `cdp()` để truy cập

## network_observer capability

| Capability | ego-browser | Playwright MCP | Chrome DevTools MCP |
|---|---|---|---|
| Navigation events | ✅ `drainEvents()` | ✅ | ✅ |
| Request URL / method | ✅ (basic) | ✅ | ✅ |
| Request body | ❌ | ✅ `browser_network_request` | ✅ `get_network_request` |
| Response body | ❌ | ✅ | ✅ |
| Response status code | ⚠️ từ events | ✅ | ✅ |
| Response headers | ❌ | ✅ | ✅ |
| Timing / TTFB | ❌ | ⚠️ | ✅ |
| WebSocket frames | ❌ | ⚠️ | ✅ |
| SSE / streaming | ❌ | ⚠️ | ✅ |
| Redirect chain | ❌ | ✅ | ✅ |
| Service worker | ❌ | ⚠️ | ✅ |
| Performance trace | ❌ | ⚠️ | ✅ |

### drainEvents() là gì

`drainEvents()` consume và return async event queue của page (navigation, basic network activity). Phù hợp để:
- Phát hiện request cơ bản trong exploratory testing
- Theo dõi navigation flow
- Chờ network activity trước assertion

**Không đủ cho:**
- Verification request body (API payload)
- Verification response body (API response content)
- GraphQL errors ẩn trong HTTP 200
- Full network contract testing

## Login state capability

| Aspect | ego-browser | Ghi chú |
|---|---|---|
| Cookie kế thừa | ✅ auto | Từ Chrome migration lúc onboarding |
| Session storage | ✅ | Cùng Chromium profile |
| Extension | ✅ | Nếu đã migrate từ Chrome |
| localStorage | ✅ | |
| Platform | macOS only | arm64 và x64 |

> **Hard gate**: Kế thừa session thật → phải tuân thủ 8 quy tắc trong [`../SKILL.md`](../SKILL.md).

## Kết hợp tối ưu

### UI + Network chi tiết (cần login thật)
```yaml
browser_driver: ego-browser
browser_observer: ego-browser
network_observer: chrome-devtools-mcp
```
Attach Chrome DevTools vào cùng Chromium process của ego lite.

### Full cross-platform (không cần login thật)
```yaml
browser_driver: playwright-mcp
browser_observer: playwright-mcp
network_observer: playwright-mcp
```

### DOM snapshot nhanh (không cần network obs)
```yaml
browser_driver: ego-browser
browser_observer: ego-browser
network_observer: unavailable
```
Chấp nhận giảm confidence trên network assertions.

## Platform status

```yaml
ego_browser:
  darwin_arm64: supported
  darwin_x64: supported
  windows: unsupported_platform  # roadmap
  linux: unsupported_platform    # roadmap

unsupported_platform_fallback:
  - playwright-mcp
  - chrome-devtools-mcp
  - playwright-runtime
```
