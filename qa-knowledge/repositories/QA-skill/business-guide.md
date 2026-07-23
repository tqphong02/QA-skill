# Business Guide: QA-skill

> **Được sinh tự động bởi REPO_BUSINESS_DISCOVERY** — Chỉ AI đọc file này, không cần đọc JSON thô  
> Sinh lúc: 2026-07-23T15:30:49.888Z  
> Commit: `8e138cc` | Branch: `main`  
> Nguồn: `/Users/user/QA-skill/qa-knowledge/repositories/QA-skill`

---

## 1. Tổng quan Hệ thống

| Thuộc tính | Giá trị |
|:---|:---|
| Tên repo | QA-skill |
| Loại | unknown |
| Framework | unknown |
| Ngôn ngữ | JavaScript |
| Số files source | 20 |
| Có TypeScript | Không |
| Có Dockerfile | Không |
| Có CI/CD | Không |
| Có OpenAPI Spec | Không |
| Modules phát hiện | none |
| Intergrations | cron_job, database, email, file_storage, http_client, payment_gateway, push_notification, queue_event, redis, sms |



---

## 2. Kiến trúc Modules

_Chưa phát hiện module_


---

## 3. API Contracts (0 endpoints)

_Chưa phát hiện API endpoint_


---

## 4. Business Rules (54 rules)

| Rule ID | Category | Condition | Failure Result | Confidence |
|:---|:---|:---|:---|:---:|
| `EXISTENCE_CHECK_AD5336` | existence_check | if (!path) return null; | Trả lỗi 404 / Not Found | verified |
| `INPUT_VALIDATION_65679D` | input_validation | const maxVus = Math.max(...stages.map((stage) => Number(stage.target || 0))); | Từ chối do dữ liệu đầu vào không hợp lệ | verified |
| `STATE_TRANSITION_7FA6C4` | state_transition | 'status 200': (r) => r.status === 200, | Không hợp lệ — sai trạng thái | verified |
| `EXISTENCE_CHECK_8EA4D8` | existence_check | if (!m) return null; | Trả lỗi 404 / Not Found | verified |
| `STATE_TRANSITION_DC7EBD` | state_transition | * ... thao tác ... // rồi assert net.find(c => c.status===200 && /updated_addons | Không hợp lệ — sai trạng thái | verified |
| `EXISTENCE_CHECK_87F20B` | existence_check | if (!root) return []; | Trả lỗi 404 / Not Found | verified |
| `EXISTENCE_CHECK_1B1C8B` | existence_check | if (!inp) return null; | Trả lỗi 404 / Not Found | verified |
| `EXISTENCE_CHECK_071CA8` | existence_check | if (SKIP_DESTR) return; | Trả lỗi 404 / Not Found | verified |
| `INPUT_VALIDATION_954786` | input_validation | for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) { | Từ chối do dữ liệu đầu vào không hợp lệ | verified |
| `INPUT_VALIDATION_B468C6` | input_validation | const handlerContent = lines.slice(i, Math.min(i + 80, lines.length)).join('\n') | Từ chối do dữ liệu đầu vào không hợp lệ | verified |
| `PERMISSION_1C0C40` | permission | /throw.*(?:ForbiddenException|UnauthorizedException|AccessDeniedException)/, | Từ chối truy cập / Unauthorized | verified |
| `PERMISSION_61E987` | permission | /hasPermission|checkPermission|assertPermission/i, | Từ chối truy cập / Unauthorized | verified |
| `FINANCIAL_B06D4E` | financial | /Insufficient|insufficient_funds|balance.*not.*enough/i, | Từ chối giao dịch do không đủ số dư | verified |
| `STATE_TRANSITION_83BF4D` | state_transition | /throw.*InvalidStatusTransition|cannot.*status/i, | Không hợp lệ — sai trạng thái | verified |
| `EXISTENCE_CHECK_B95A29` | existence_check | /throw.*(?:NotFoundException|NotFoundError|EntityNotFound)/, | Trả lỗi 404 / Not Found | verified |
| `UNIQUENESS_38EC2D` | uniqueness | /ConflictException|DuplicateException|already.*exist|is.*taken/i, | Từ chối do dữ liệu đã tồn tại | verified |
| `UNIQUENESS_58EC27` | uniqueness | /UNIQUE.*constraint|unique.*violation/i, | Từ chối do dữ liệu đã tồn tại | verified |
| `RATE_LIMIT_5BA9F4` | rate_limit | // Rate limit / throttle | Tạm khóa do vượt giới hạn request | inferred |
| `RATE_LIMIT_B419A9` | rate_limit | /@Throttle|RateLimit|TooManyRequests|throttle/i, | Tạm khóa do vượt giới hạn request | inferred |
| `RATE_LIMIT_5357EF` | rate_limit | /retry.*attempt|maxRetries|retryCount/i, | Tạm khóa do vượt giới hạn request | inferred |
| `INPUT_VALIDATION_F72382` | input_validation | /@IsNotEmpty|@IsEmail|@IsNumber|@Min\(|@Max\(|@Length\(|@IsString|@IsEnum/, | Từ chối do dữ liệu đầu vào không hợp lệ | verified |
| `FEATURE_FLAG_7C3DE5` | feature_flag | category: 'feature_flag', | Tính năng chưa được bật / Feature disabled | inferred |
| `FEATURE_FLAG_048660` | feature_flag | /featureFlag|feature_flag|isEnabled|isFeatureEnabled|FEATURE_/i, | Tính năng chưa được bật / Feature disabled | inferred |
| `EXISTENCE_CHECK_2F18F9` | existence_check | if (!launcher) return { engine: engineName, device: deviceName, error: 'engine k | Trả lỗi 404 / Not Found | verified |
| `INPUT_VALIDATION_1D12D6` | input_validation | const chunks = Array.from({ length: Math.min(WORKERS, moduleKeys.length) }, () = | Từ chối do dữ liệu đầu vào không hợp lệ | verified |
| `FEATURE_FLAG_C83377` | feature_flag | featureFlags: typeof window.featureFlags !== 'undefined' ? Object.keys(window.fe | Tính năng chưa được bật / Feature disabled | inferred |
| `UNIQUENESS_2F3B2A` | uniqueness | // If guide already exists, add merge fields | Từ chối do dữ liệu đã tồn tại | verified |
| `FEATURE_FLAG_B53A99` | feature_flag | const FEATURE_NAME = getArg('--feature', ''); | Tính năng chưa được bật / Feature disabled | inferred |
| `FEATURE_FLAG_F81C81` | feature_flag | const slug = FEATURE_NAME ? slugify(FEATURE_NAME) : slugify(URL_PATH); | Tính năng chưa được bật / Feature disabled | inferred |
| `STATE_TRANSITION_488549` | state_transition | // --steps "1. Mở /events|2. Chọn Status=Pending" \ | Không hợp lệ — sai trạng thái | verified |
| `STATE_TRANSITION_F9934E` | state_transition | // --reason "Filter Status=Pending trả 0 thay vì 6, AC #1 fail" \ | Không hợp lệ — sai trạng thái | verified |
| `PERMISSION_AB5E87` | permission | * - @UseGuards() với RolesGuard / JwtAuthGuard | Từ chối truy cập / Unauthorized | verified |
| `PERMISSION_258954` | permission | * - hasRole, hasPermission, canActivate checks | Từ chối truy cập / Unauthorized | verified |
| `INPUT_VALIDATION_376E2A` | input_validation | for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) { | Từ chối do dữ liệu đầu vào không hợp lệ | verified |
| `INPUT_VALIDATION_C8D92F` | input_validation | for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) { | Từ chối do dữ liệu đầu vào không hợp lệ | verified |
| `EXISTENCE_CHECK_DC1761` | existence_check | if (hasFrontend) return 'frontend'; | Trả lỗi 404 / Not Found | verified |
| `EXISTENCE_CHECK_13361F` | existence_check | if (hasBackend) return 'backend'; | Trả lỗi 404 / Not Found | verified |
| `INPUT_VALIDATION_7B5E2D` | input_validation | for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) { | Từ chối do dữ liệu đầu vào không hợp lệ | verified |
| `INPUT_VALIDATION_1FB2F3` | input_validation | for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) { | Từ chối do dữ liệu đầu vào không hợp lệ | verified |
| `INPUT_VALIDATION_357FFE` | input_validation | const context = lines.slice(Math.max(0, i - 5), i).join(' '); | Từ chối do dữ liệu đầu vào không hợp lệ | verified |

_...và 14 rule khác_


---

## 5. State Machines

**record**

States: ``

- `ANY` → `APPROVED`


---

## 6. Business Flows (0 flows)

_Chưa phát hiện flow_

---

## 7. Permission Matrix

**Roles phát hiện:** none

_Chưa phát hiện permission grant_

---

## 8. Domain Model (0 entities)

_Chưa phát hiện entity_



---

## 9. Tích hợp Bên ngoài

- **cron_job**
- **database**
- **email**
- **file_storage**
- **http_client**
- **payment_gateway**
- **push_notification**
- **queue_event**
- **redis**
- **sms**

---

## 10. Điểm Quan trọng cho QA

### Business Rules cần test kỹ
- [STATE_TRANSITION_7FA6C4] **state_transition**: 'status 200': (r) => r.status === 200, → Không hợp lệ — sai trạng thái
- [STATE_TRANSITION_DC7EBD] **state_transition**: * ... thao tác ... // rồi assert net.find(c => c.status===200 && /updated_addons":\[\]/.test(c.body) → Không hợp lệ — sai trạng thái
- [PERMISSION_1C0C40] **permission**: /throw.*(?:ForbiddenException|UnauthorizedException|AccessDeniedException)/, → Từ chối truy cập / Unauthorized
- [PERMISSION_61E987] **permission**: /hasPermission|checkPermission|assertPermission/i, → Từ chối truy cập / Unauthorized
- [FINANCIAL_B06D4E] **financial**: /Insufficient|insufficient_funds|balance.*not.*enough/i, → Từ chối giao dịch do không đủ số dư
- [STATE_TRANSITION_83BF4D] **state_transition**: /throw.*InvalidStatusTransition|cannot.*status/i, → Không hợp lệ — sai trạng thái
- [STATE_TRANSITION_488549] **state_transition**: // --steps "1. Mở /events|2. Chọn Status=Pending" \ → Không hợp lệ — sai trạng thái
- [STATE_TRANSITION_F9934E] **state_transition**: // --reason "Filter Status=Pending trả 0 thay vì 6, AC #1 fail" \ → Không hợp lệ — sai trạng thái
- [PERMISSION_AB5E87] **permission**: * - @UseGuards() với RolesGuard / JwtAuthGuard → Từ chối truy cập / Unauthorized
- [PERMISSION_258954] **permission**: * - hasRole, hasPermission, canActivate checks → Từ chối truy cập / Unauthorized

### State transitions cần test boundary
- **record**: Kiểm tra không thể nhảy state bất hợp lệ, rollback khi lỗi

### API cần test auth/permission
_Chưa phát hiện_

---

## 11. Knowledge Gaps & Assumptions

> [!NOTE]
> Các mục dưới đây là **suy luận từ code** (confidence: inferred) — cần con người xác nhận

- // Rate limit / throttle
- /@Throttle|RateLimit|TooManyRequests|throttle/i,
- /retry.*attempt|maxRetries|retryCount/i,
- category: 'feature_flag',
- /featureFlag|feature_flag|isEnabled|isFeatureEnabled|FEATURE_/i,

---

## 12. Discovery Session

| | |
|:---|:---|
| Chạy lúc | 2026-07-23T15:25:33.055Z |
| Thời gian | 0.8s |
| Mode | phase1 |
| Commit | 8e138cc |
| Output dir | `/Users/user/QA-skill/qa-knowledge/repositories/QA-skill` |

---

_Cập nhật lại bằng cách chạy: `node qa-run/scripts/repo-business-discovery.mjs --repo <path> --mode incremental`_
