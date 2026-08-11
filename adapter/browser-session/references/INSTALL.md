# ego-browser — Install

Đọc file này chỉ khi ego lite chưa install hoặc `detect.mjs` báo lỗi. Với browser work thông thường, dùng [`../SKILL.md`](../SKILL.md).

ego lite website: https://lite.ego.app/
Upstream repo: https://github.com/citrolabs/ego-lite

## Platform

ego lite hiện chỉ hỗ trợ **macOS** (arm64 và x64). Windows và Linux nằm trong roadmap upstream.

Trên Windows/Linux: dùng Playwright MCP hoặc Chrome DevTools MCP. Không block workflow.

## Detect trước khi install

```bash
node adapter/browser-session/scripts/detect.mjs
```

Output sẽ cho biết:
- OS có phải macOS không
- `ego-browser` CLI có tồn tại không
- ego lite app có đang chạy không
- Upstream skill đã cài chưa
- CLI có phản hồi không

## Install options

### Option A — npx skills CLI (khuyến nghị)

```bash
npx skills add citrolabs/ego-lite
```

Cài ego-browser skill cho agent hiện tại. Lần đầu agent chạy browser task, agent sẽ hướng dẫn install ego lite app.

### Option B — Download app thủ công

1. Vào https://lite.ego.app/ và download macOS app
2. Mở DMG và kéo ego lite vào Applications
3. Mở Terminal và chạy:
   ```bash
   xattr -d com.apple.quarantine "/Applications/ego lite.app" 2>/dev/null || true
   ```
4. Mở ego lite từ Applications

### Option C — Script hướng dẫn từ skill này

```bash
sh adapter/browser-session/scripts/install-skill.sh
```

Script in hướng dẫn từng bước và mở trang download. Không tự tải DMG hay mở app.

## First-run onboarding

Sau khi ego lite app mở lần đầu:

1. **Import từ Chrome** — chọn Yes để agent kế thừa login state thật
   - Nếu bỏ qua bước này, agent không có cookie/session của user
   - Có thể import lại sau trong ego lite Settings
2. Hoàn tất các bước onboarding còn lại

> **Lưu ý bảo mật**: Import Chrome data nghĩa là agent có thể thao tác với session thật. Đọc hard gate trong [`../SKILL.md`](../SKILL.md) trước khi chạy task trên production.

## Verify sau install

```bash
node adapter/browser-session/scripts/detect.mjs
node adapter/browser-session/scripts/smoke-test.mjs --url https://example.com
```

## Troubleshooting

| Vấn đề | Nguyên nhân | Fix |
|---|---|---|
| `command not found: ego-browser` | CLI chưa install hoặc PATH thiếu | Chạy Option A hoặc B, reopen terminal |
| Gatekeeper block | macOS quarantine | `xattr -d com.apple.quarantine "/Applications/ego lite.app"` |
| `ego-browser` không connect | ego lite app chưa chạy | Mở app ego lite từ Applications |
| Login state không có | Bỏ qua Chrome import | ego lite Settings → Import lại từ Chrome |
| `detect.mjs` báo `cli_not_found` | PATH chưa update | Mở terminal mới sau khi install |
