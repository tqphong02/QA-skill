# Kết nối Chrome DevTools MCP và k6 MCP

## Chrome DevTools MCP

Yêu cầu Node.js và Google Chrome hoặc Chrome for Testing. Cấu hình mặc định dưới đây dùng profile tạm, headless, tắt CrUX và usage statistics để giảm rò rỉ dữ liệu ngoài target:

```bash
codex mcp add chrome-devtools -- \
  npx -y chrome-devtools-mcp@latest \
  --headless=true \
  --isolated=true \
  --no-performance-crux \
  --no-usage-statistics
```

Kiểm tra package có thể khởi động:

```bash
npx -y chrome-devtools-mcp@latest --help
codex mcp get chrome-devtools
```

Mở phiên Codex mới rồi smoke test read-only bằng cách mở một URL công khai được phép và đọc console. Không dùng profile Chrome cá nhân cho kiểm thử mặc định.

Tài liệu chính chủ: <https://github.com/ChromeDevTools/chrome-devtools-mcp>

Antigravity dùng cùng stdio command. Bật entry `chrome-devtools` trong `.agents/mcp_config.json`, restart host rồi chạy `/mcp`

## k6 MCP

Cài k6 theo tài liệu Grafana rồi xác nhận:

```bash
k6 version
k6 x mcp --help
codex mcp add k6 -- k6 x mcp
codex mcp get k6
```

Trên macOS có Homebrew:

```bash
brew install k6
```

Mở phiên Codex mới rồi yêu cầu k6 giải thích một script hoặc validate cú pháp trước. Không chạy load trong smoke test.

MCP không cấp quyền load. Mọi run lớn hơn một user phải có performance contract và approval theo `../SKILL.md`. Template k6 sẽ dừng nếu thiếu contract hoặc `K6_LOAD_APPROVED=true`.

Tài liệu chính chủ: <https://grafana.com/docs/k6/latest/set-up/configure-ai-assistant/>

Antigravity bật entry `k6` trong `.agents/mcp_config.json`. Trên Windows, xác nhận `k6.exe` nằm trong PATH trước khi restart host

## Chẩn đoán

```bash
bash ../../integration-github/scripts/doctor-stack.sh --agent=codex chrome-devtools k6
bash ../../integration-github/scripts/doctor-stack.sh --agent=antigravity chrome-devtools k6
```

Nếu `configured` nhưng tool không xuất hiện, mở phiên host mới và kiểm tra `codex mcp list` hoặc Antigravity `/mcp`. Nếu server không start, kiểm tra `node`, `npx`, `k6`, Chrome và MCP log trước khi sửa skill
