# Plane QA - Multi-workspace CRUD Skill

Codex entrypoint: read [SKILL.md](SKILL.md). This README documents the CLI only.

Bộ công cụ CRUD cho [Plane](https://plane.so) - công cụ quản lý dự án giống Jira.

> 🐞 **Log bug?** Đọc **[BUG_FORMAT.md](BUG_FORMAT.md)** để theo đúng format chuẩn (manual-friendly, in đậm các mục, đính ảnh evidence, assign). Chạy nhanh: `python3 work-items/log-bug.py <bug.json>` (mẫu: `bug-template.json`).

> 📋 **Viết Daily Report?** Đọc **[REPORT_FORMAT.md](REPORT_FORMAT.md)** — format chuẩn plain-list (không bảng, không icon/emoji), gồm Task / Tổng quan / Evidence / Bug log / Blocker / Next plan. Khi user yêu cầu "viết report", "tổng kết hôm nay", "báo cáo cycle" → xuất theo structure đó.

> 🖼️ **Ảnh xem THẲNG trong comment (không bắt tải về)?** Dùng `comments/post-inline.py` — upload ảnh rồi nhúng node `<image-component>` của editor để render inline. **Không chèn icon/emoji vào nội dung.**
> ```bash
> python3 comments/post-inline.py --ref PROJ-1 --text "Retest PASS" --img a.png --img b.png
> python3 comments/post-inline.py --wi <work_item_id> --project <project_id> --img evidence/x.png
> python3 comments/post-inline.py --ref PROJ-1 --delete <comment_id>   # xoá
> ```
> Lý do: API key chỉ upload được qua `issue-attachments` (lấy `asset_id`); endpoint editor-asset `/api/assets/v2/...` chặn API key (401). Logic dùng chung ở `utils/inline_image.py` (class `Client`: `resolve` / `upload_asset` / `image_node` / `post_comment` / `delete_comment`).

## 📁 Cấu trúc

```
plane-qa/
├── plane.sh              # Main entry point
├── config.env.example    # Mẫu cấu hình non-secret
├── README.md             # Tài liệu này
├── utils/
│   ├── common.sh         # Hàm chung (API request, colors, helpers)
│   ├── paginate.sh       # Xử lý phân trang cursor-based
│   └── inline_image.py   # Client: upload asset + nhúng <image-component> (ảnh inline)
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
    └── post-inline.py    # Post comment kèm ẢNH INLINE (xem thẳng, không icon)
```

## ⚙️ Cài đặt

### 1. Cấu hình Plane

Tạo cấu hình non-secret và export API key riêng:

```bash
cp config.env.example config.env

# API Key lấy từ Profile Settings → Personal Access Tokens
export PLANE_API_KEY="plane_api_your_key_here"

# Hoặc key riêng theo workspace slug
export PLANE_API_KEY_WORKSPACE_A="plane_api_workspace_a"
```

Không ghi API key vào `config.env`, JSON, Markdown hoặc Git. Khi có URL Plane, skill tự nhận base URL, workspace, project và ticket từ URL đó.

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
