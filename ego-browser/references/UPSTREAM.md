# ego-browser — Upstream Version

File này track version của upstream ego-lite skill được tích hợp vào QA-skill.

## Version info

```yaml
repository: https://github.com/citrolabs/ego-lite
skill_path: skills/ego-browser
skill_version: "1.2.6"
skill_date: "2026-07-20"
last_verified: "2026-07-31"
tested_commit: null   # chưa pin — cập nhật sau khi verify bằng smoke-test.mjs
integration_status: adapter_only
```

## Adapter approach

QA-skill dùng **thin adapter** — không copy upstream helpers vào repo. SKILL.md của QA-skill chỉ chứa:
- Rules khi nào dùng / không dùng
- Hard gate cho login state thật
- Link đến upstream helper reference
- QA-skill artifact conventions

Upstream SKILL.md là source of truth cho CLI syntax, helper API, và task space behavior.

## Cách xem upstream SKILL.md

```bash
# Nếu đã install qua npx skills
cat "$(npx --yes skills which citrolabs/ego-lite 2>/dev/null)/ego-browser/SKILL.md"

# Hoặc đọc online
# https://github.com/citrolabs/ego-lite/tree/main/skills/ego-browser/SKILL.md
```

## Khi nào cần update

Cập nhật `last_verified` và `tested_commit` sau khi:
1. Chạy `node ego-browser/scripts/smoke-test.mjs` thành công với version mới
2. Confirm helper API không thay đổi breaking change
3. Kiểm tra release notes tại https://github.com/citrolabs/ego-lite/releases

Nếu upstream thay đổi CLI syntax hoặc helper API, chỉ cần update references trong:
- [`CAPABILITIES.md`](CAPABILITIES.md) — cập nhật bảng API
- [`QA-INTEGRATION.md`](QA-INTEGRATION.md) — cập nhật example nếu cần
- [`INSTALL.md`](INSTALL.md) — cập nhật install steps

Không cần touch `SKILL.md` chính trừ khi thay đổi rules hoặc hard gate.

## Changelog tích hợp

| Ngày | Hành động | Ghi chú |
|---|---|---|
| 2026-07-31 | Initial integration | Adapter thin, 4 reference files, detect.mjs + smoke-test.mjs |
