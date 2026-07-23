# Traceability Matrix: QA-skill

> Sinh tự động bởi `traceability-matrix-generator.mjs` — 2026-07-23T15:30:49.959Z  
> Dùng file này để đảm bảo mọi business flow đều có testcase tương ứng

---

## Flow → Rule → API → Entity → Testcase Hints

| Flow ID | Flow Name | Module | Rules | APIs | Entities | Test Hints | Confidence |
|:---|:---|:---|:---|:---|:---|:---|:---:|


---

## Orphan Business Rules (không gắn với flow nào)

> Các rule này tồn tại trong code nhưng chưa được ánh xạ vào flow — cần bổ sung testcase riêng

| Rule ID | Module | Category | Condition | Failure |
|:---|:---|:---|:---|:---|
| `EXISTENCE_CHECK_AD5336` | performance | existence_check | if (!path) return null; | Trả lỗi 404 / Not Found |
| `INPUT_VALIDATION_65679D` | performance | input_validation | const maxVus = Math.max(...stages.map((stage) => Number(stage.target | | Từ chối do dữ liệu đầu vào không hợp lệ |
| `STATE_TRANSITION_7FA6C4` | performance | state_transition | 'status 200': (r) => r.status === 200, | Không hợp lệ — sai trạng thái |
| `EXISTENCE_CHECK_8EA4D8` | lib | existence_check | if (!m) return null; | Trả lỗi 404 / Not Found |
| `STATE_TRANSITION_DC7EBD` | lib | state_transition | * ... thao tác ... // rồi assert net.find(c => c.status===200 && /upda | Không hợp lệ — sai trạng thái |
| `EXISTENCE_CHECK_87F20B` | scripts | existence_check | if (!root) return []; | Trả lỗi 404 / Not Found |
| `EXISTENCE_CHECK_1B1C8B` | scripts | existence_check | if (!inp) return null; | Trả lỗi 404 / Not Found |
| `EXISTENCE_CHECK_071CA8` | scripts | existence_check | if (SKIP_DESTR) return; | Trả lỗi 404 / Not Found |
| `INPUT_VALIDATION_954786` | scripts | input_validation | for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) { | Từ chối do dữ liệu đầu vào không hợp lệ |
| `INPUT_VALIDATION_B468C6` | scripts | input_validation | const handlerContent = lines.slice(i, Math.min(i + 80, lines.length)). | Từ chối do dữ liệu đầu vào không hợp lệ |
| `PERMISSION_1C0C40` | scripts | permission | /throw.*(?:ForbiddenException|UnauthorizedException|AccessDeniedExcept | Từ chối truy cập / Unauthorized |
| `PERMISSION_61E987` | scripts | permission | /hasPermission|checkPermission|assertPermission/i, | Từ chối truy cập / Unauthorized |
| `FINANCIAL_B06D4E` | scripts | financial | /Insufficient|insufficient_funds|balance.*not.*enough/i, | Từ chối giao dịch do không đủ số dư |
| `STATE_TRANSITION_83BF4D` | scripts | state_transition | /throw.*InvalidStatusTransition|cannot.*status/i, | Không hợp lệ — sai trạng thái |
| `EXISTENCE_CHECK_B95A29` | scripts | existence_check | /throw.*(?:NotFoundException|NotFoundError|EntityNotFound)/, | Trả lỗi 404 / Not Found |
| `UNIQUENESS_38EC2D` | scripts | uniqueness | /ConflictException|DuplicateException|already.*exist|is.*taken/i, | Từ chối do dữ liệu đã tồn tại |
| `UNIQUENESS_58EC27` | scripts | uniqueness | /UNIQUE.*constraint|unique.*violation/i, | Từ chối do dữ liệu đã tồn tại |
| `RATE_LIMIT_5BA9F4` | scripts | rate_limit | // Rate limit / throttle | Tạm khóa do vượt giới hạn request |
| `RATE_LIMIT_B419A9` | scripts | rate_limit | /@Throttle|RateLimit|TooManyRequests|throttle/i, | Tạm khóa do vượt giới hạn request |
| `RATE_LIMIT_5357EF` | scripts | rate_limit | /retry.*attempt|maxRetries|retryCount/i, | Tạm khóa do vượt giới hạn request |

---

## Coverage Summary

| Metric | Count |
|:---|:---:|
| Total flows | 0 |
| Flows với rules | 0 |
| Flows với APIs | 0 |
| Flows với entities | 0 |
| Orphan rules | 20 |
| Total testcase hints | 0 |

---

_Cập nhật lại: `node qa-run/scripts/repo-business-discovery.mjs --repo <path> --mode full`_
