# Plane QA - Multi-workspace CRUD Skill

Codex entrypoint: read [SKILL.md](SKILL.md). This README documents the CLI only.

Bộ công cụ CRUD cho [Plane](https://plane.so) - công cụ quản lý dự án giống Jira.

> 🐞 **Log bug?** Đọc **[BUG_FORMAT.md](BUG_FORMAT.md)** để theo đúng format chuẩn (manual-friendly, in đậm các mục, đính ảnh evidence, assign). Chạy nhanh: `python3 work-items/log-bug.py <bug.json>` (mẫu: `bug-template.json`).

> 📋 **Viết Daily Report?** Đọc **[REPORT_FORMAT.md](REPORT_FORMAT.md)** — format chuẩn plain-list (không bảng, không icon/emoji), gồm Task / Tổng quan / Evidence / Bug log / Blocker / Next plan. Khi user yêu cầu "viết report", "tổng kết hôm nay", "báo cáo cycle" → xuất theo structure đó.

> 🖼️ **Ảnh inline trong Description hoặc Comment?** Dùng authenticated browser editor và paste ảnh vào rich-text content để giữ `Attachments 0`. API image routes bên dưới chỉ là legacy compatibility và không dùng mặc định.
> `comments/post-inline.py --img` is blocked in the default workflow. Use it only for an explicitly requested legacy attachment workflow. Text-only comments remain supported.

## 📁 Cấu trúc

```
plane-qa/
├── plane.sh              # Main entry point
├── .env.example          # Local non-secret browser/routing placeholder
├── .gitignore             # Local credentials and browser state exclusions
├── config.env.example    # Mẫu cấu hình non-secret
├── README.md             # Tài liệu này
├── utils/
│   ├── common.sh         # Hàm chung (API request, colors, helpers)
│   ├── paginate.sh       # Xử lý phân trang cursor-based
│   └── inline_image.py   # Legacy API attachment-backed image client
├── projects/
│   └── manage.sh         # CRUD Projects
├── work-items/
│   └── manage.sh         # CRUD Work Items (Issues)
├── cycles/
│   └── manage.sh         # CRUD Cycles (Sprints)
├── modules/
│   └── manage.sh         # CRUD Modules
└── comments/
    ├── manage.sh         # CRUD Comments
    └── post-inline.py    # Text-only compatibility; image args blocked by default
```

## ⚙️ Cài đặt

### 1. Cấu hình Plane

Tạo cấu hình non-secret và export API key riêng:

```bash
cp .env.example .env

# API Key lấy từ Profile Settings → Personal Access Tokens
export PLANE_API_KEY="plane_api_your_key_here"

# Hoặc key riêng theo workspace slug
export PLANE_API_KEY_WORKSPACE_A="plane_api_workspace_a"
```

`.env` là file local-only chứa routing, `PLANE_EMAIL`, `PLANE_PASSWORD`, `PLANE_API_KEY` và tuỳ chọn `PLANE_BROWSER_STATE_PATH`. Không in credential ra log và không ghi vào JSON, Markdown hoặc Git. Browser login dùng email/password khi người dùng cho phép; API route chỉ dùng Personal API Key. Khi có URL Plane, skill tự nhận base URL, workspace, project và ticket từ URL đó.

Khởi tạo storage state bằng Playwright khi chưa có session:

```bash
node scripts/browser-auth.mjs --url 'https://projects.metasolutions.ai/mds-team/browse/AIFA-459/' --state auth.json
```

Browser sẽ mở ở chế độ headed, tự điền email/password từ `.env`, chờ MFA nếu tài khoản yêu cầu, xác minh `/api/users/me/`, rồi lưu `auth.json`. File này đã nằm trong `.gitignore`

### 2. Cấp quyền thực thi

```bash
chmod +x plane-qa/plane.sh
chmod +x plane-qa/*/manage.sh plane-qa/scripts/*.sh
```

## 🚀 Sử dụng

### Tổng quan

```bash
./plane.sh <resource> <action> [args...]
```

### Projects

```bash
# Liệt kê tất cả projects
./plane.sh project list

# Xem chi tiết project
./plane.sh project get <project_id>

# Tạo project mới
./plane.sh project create '{"name":"My Project","identifier":"MYPROJ"}'

# Cập nhật project
./plane.sh project update <project_id> '{"description":"Updated desc"}'

# Xóa project
./plane.sh project delete <project_id>

# Archive/Unarchive
./plane.sh project archive <project_id>
./plane.sh project unarchive <project_id>
```

### Work Items (Issues)

```bash
# Liệt kê work items
./plane.sh issue list <project_id>

# Xem chi tiết
./plane.sh issue get <work_item_id> <project_id>

# Tạo work item
./plane.sh issue create <project_id> '{"name":"Fix bug #123","priority":"high"}'

# Cập nhật
./plane.sh issue update <work_item_id> <project_id> '{"state":"uuid-of-state"}'

# Xóa
./plane.sh issue delete <work_item_id> <project_id>

# Tìm kiếm
./plane.sh issue search "bug" <project_id>
```

### Cycles (Sprints)

```bash
# Liệt kê cycles
./plane.sh cycle list <project_id>

# Tạo cycle
./plane.sh cycle create <project_id> '{"name":"Sprint 1","start_date":"2024-01-15","end_date":"2024-01-29"}'

# Thêm work items vào cycle
./plane.sh cycle add-items <cycle_id> <project_id> '{"work_items":["uuid-1","uuid-2"]}'

# Xem work items trong cycle
./plane.sh cycle list-items <cycle_id> <project_id>
```

### Modules

```bash
# Liệt kê modules
./plane.sh module list <project_id>

# Tạo module
./plane.sh module create <project_id> '{"name":"Auth Module"}'

# Thêm work items vào module
./plane.sh module add-items <module_id> <project_id> '{"work_items":["uuid-1"]}'
```

### Comments

```bash
# Liệt kê comments
./plane.sh comment list <work_item_id> <project_id>

# Tạo comment
./plane.sh comment create <work_item_id> <project_id> '{"comment_html":"<p>Done!</p>"}'

# Xóa comment
./plane.sh comment delete <comment_id> <work_item_id> <project_id>
```

## 🔑 API Reference

- **Base URL:** `https://api.plane.so/api/v1/`
- **Auth:** `X-API-Key` header
- **Docs:** https://developers.plane.so/api-reference/introduction
- **Rate Limit:** 60 requests/minute

## 📝 JSON Data Fields

### Project
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | ✅ | Tên project |
| identifier | string | ✅ | Mã project (VD: MYPROJ) |
| description | string | ❌ | Mô tả |
| network | int | ❌ | 0=Secret, 2=Public |
| cover_image | url | ❌ | Ảnh cover |
| cycle_view | bool | ❌ | Hiện cycle |
| module_view | bool | ❌ | Hiện module |

### Work Item
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | ✅ | Tên work item |
| description_html | string | ❌ | Mô tả (HTML) |
| priority | string | ❌ | none/low/medium/high/urgent |
| state | uuid | ❌ | ID state |
| assignees | [uuid] | ❌ | Danh sách assignee |
| labels | [uuid] | ❌ | Danh sách label |
| start_date | date | ❌ | Ngày bắt đầu |
| target_date | date | ❌ | Hạn hoàn thành |
| parent | uuid | ❌ | ID parent issue |

### Cycle
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | ✅ | Tên cycle |
| start_date | date | ❌ | Ngày bắt đầu |
| end_date | date | ❌ | Ngày kết thúc |

### Module
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | ✅ | Tên module |
| description | string | ❌ | Mô tả |
| start_date | date | ❌ | Ngày bắt đầu |
| target_date | date | ❌ | Hạn hoàn thành |
