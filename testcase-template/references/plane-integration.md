# Plane Integration - Fetch ticket từ URL

> **Khi nào đọc file này**: Khi user paste URL ticket Plane và muốn AI tự fetch nội dung. Tham chiếu `@references/plane-integration.md` trong SKILL.md.

## Workflow

Khi user paste URL ticket Plane (vd `https://projects.metasolutions.ai/mds-team/projects/<PID>/issues/<SEQ>/`):
1. Parse URL → `project_id`, `sequence_id`
2. Gọi Plane API
3. Trích AC từ `description_html`
4. Map thành requirements JSON

## Helper script

`qa-run/scripts/fetch-plane-issue.sh` đã có sẵn:

```bash
PLANE_API_KEY="plane_pat_..."  # từ Plane Profile → Personal Access Tokens
PLANE_BASE_URL="https://api.plane.so/api/v1"
PLANE_WORKSPACE_SLUG="mds-team"

# Gọi
fetch-plane-issue.sh <project_id> <sequence_id>
```

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| 404 Not Found | Sai `project_id` hoặc `sequence_id` | Check lại URL ticket |
| 401 Unauthorized | API key sai/expire | Rotate key ở Plane Profile |
| 403 Forbidden | Không có quyền vào workspace | Check workspace slug |

## Khi nào dùng nhánh nào

| User input | Nhánh |
|---|---|
| URL ticket Plane | 1A - auto fetch (khuyến nghị) |
| Paste text vào chat | 1B - parse text thủ công |
| Chỉ tên feature | 1C - suy luận từ UI, flag [Additional (out-of-spec)] |

## Ví dụ

User: "Sinh test case cho ticket https://projects.metasolutions.ai/mds-team/projects/9482533a-.../issues/466/"

AI:
1. Parse URL → project `9482533a-...`, issue seq `466`
2. Gọi `fetch-plane-issue.sh 9482533a-... 466` → lấy JSON
3. Đọc: `name="[Login] Login fail with wrong password"`, `description_html` chứa AC
4. Trích AC: AC1, AC2, AC3 → map vào `requirements`
5. Build JSON test case theo workflow 5 bước
