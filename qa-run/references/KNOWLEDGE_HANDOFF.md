# QA Business Knowledge Handoff

## Canonical location

Lưu hai tầng guide tại:

```text
<project-root>/qa-knowledge/app-business-guide.md
<project-root>/qa-knowledge/<feature-slug>-business-guide.md
```

- App guide là module map tổng thể, dependency giữa feature, role, flow chính và coverage gap
- Feature guide là business logic chi tiết phục vụ retest và impacted regression

Không lưu guide trong thư mục skill, `evidence/`, `test-results/` hoặc folder tạm

## Trước khi test

1. Resolve project root và feature slug từ request, ticket, URL hoặc cwd
2. Đọc `app-business-guide.md` trước nếu có, sau đó đọc đúng feature guide
3. Trích phần còn dùng được vào test contract trước browser action
4. Kiểm tra `Environment`, `Last verified`, source và confidence trước khi tin dữ liệu
5. Reuse route, locator, role/data, state transition và reusable assets đã xác nhận
6. Không bỏ retest hoặc verification bắt buộc chỉ vì guide cũ ghi PASS
7. Không đọc toàn bộ mọi feature guide; chỉ đọc app guide và feature guide khớp ticket/scope

Nếu retest không có guide, khám phá đủ feature và impacted flow rồi tạo feature guide sau run. Không tự mở rộng thành full-app baseline

Nếu user yêu cầu khám phá tổng thể hoặc project chưa có app guide và request không phải retest, chạy `APP_BASELINE_DISCOVERY`:

1. Inventory navigation, module và entry point nhìn thấy được
2. Ưu tiên flow business chính theo rủi ro và dependency
3. Với mỗi module, kiểm tra happy flow, role/state, validation, persistence, side effect/integration và UI/UX khi có thể
4. Ghi `covered`, `partial`, `blocked` hoặc `not_covered` cùng reason/evidence vào coverage map
5. Không tuyên bố exhaustive khi thiếu role, data, requirement hoặc quyền truy cập
6. Tạo app guide và feature guide cho khu vực đã khám phá đủ sâu

## Sau khi test

Tạo JSON update đầy đủ rồi chạy:

```bash
node scripts/write-business-guide.mjs guide-update.json <project-root>
node scripts/write-business-guide.mjs --check <project-root>/qa-knowledge/<feature-slug>-business-guide.md
```

JSON update tối thiểu:

```json
{
  "guide_kind": "feature",
  "project": "Project name",
  "feature": "Feature name",
  "slug": "feature-name",
  "environment": "UAT",
  "base_url": "https://uat.example.com/feature",
  "last_verified": "2026-07-18",
  "confidence": "mixed",
  "source_refs": [],
  "coverage_map": [],
  "roles": [],
  "entry_points": [],
  "happy_flow": [],
  "business_rules": [],
  "states": [],
  "inputs": [],
  "side_effects": [],
  "integrations": [],
  "api_network": [],
  "ui_ux": [],
  "known_issues": [],
  "reusable_assets": [],
  "unresolved": [],
  "latest_run": {
    "scope": "Retest hoặc test scope",
    "verdict": "PASS",
    "notes": []
  }
}
```

Với app guide, dùng `"guide_kind": "app"`, `"feature": "Application overview"`, `"slug": "app"` và bắt buộc có `coverage_map`

Mỗi fact nên là object có nội dung chính, `status` và `source` hoặc `evidence`. Với guide đã có, thêm `previous_guide` và `merge_confirmed` theo hard gate dưới đây

Nếu guide đã tồn tại, đọc và merge facts còn đúng vào JSON update trước khi render. JSON phải có `previous_guide` trỏ đúng file cũ và `merge_confirmed: true`; writer từ chối overwrite nếu thiếu hai field này. Không xóa business rule, known issue hoặc reusable asset cũ chỉ vì run mới không chạm tới chúng

Guide phải chứa:

- Metadata, environment, base URL và ngày verify
- Sources cùng confidence `verified`, `inferred` hoặc `unresolved`
- Module coverage map với status và gap, bắt buộc cho app guide
- Role và permission
- Entry point và happy business flow
- Business rule
- State và transition
- Input, validation và boundary
- Side-effect và integration
- API/network contract
- UI/UX behavior ổn định
- Known issue
- Reusable script, route, locator, data setup hoặc evidence path
- Unresolved question
- Scope và verdict của run mới nhất

## Truth rules

- Chỉ ghi `verified` khi đã có source hoặc evidence từ run
- Ghi `inferred` cho logic suy ra từ UI/network và nêu nguồn suy luận
- Ghi `unresolved` khi chưa có expected hoặc không đủ quyền/data
- Không biến observed behavior thành business rule confirmed nếu không có spec hoặc source authority
- Không coi `partial`, `blocked` hoặc `not_covered` là coverage đã hoàn tất
- Không lưu password, token, cookie, API key, storage state hoặc dữ liệu cá nhân nhạy cảm
- Không nhúng ảnh hay log dài; chỉ lưu path evidence và kết luận ngắn
- Không đặt dấu `.` cuối prose và không chèn emoji/icon
