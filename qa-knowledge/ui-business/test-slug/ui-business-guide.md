# UI Business Reconciliation: test-slug

> **Được sinh tự động bởi UI_BUSINESS_RECONCILIATION**  
> Sinh lúc: 2026-07-23T16:16:03.858Z  
> Nguồn: `/Users/user/QA-skill/qa-knowledge/ui-business/test-slug`

---

## 1. Tổng quan mục tiêu trang
Trang `test-slug` phục vụ quản lý chu trình nghiệp vụ đối tượng hệ thống. Cung cấp các thao tác tạo mới, cập nhật, gửi duyệt, phê duyệt và theo dõi trạng thái.

---

## 2. Actor và role quan sát được
- **Role: Staff**

---

## 3. Action có ý nghĩa business
| Button / Field | Category | Intent | Expected State | Risk Level |
|:---|:---|:---|:---|:---:|
| `Approve` | primary_action_button | `APPROVE` | APPROVED | high |
| `Save Draft` | secondary_action_button | `SAVE_DRAFT` | DRAFT | medium |
| `Submit` | primary_action_button | `SUBMIT` | SUBMITTED | high |
| `Submit Order Error` | primary_action_button | `SUBMIT` | SUBMITTED | high |
| `Cancel` | secondary_action_button | `CANCEL` | CANCELLED | medium |
| `Delete` | secondary_action_button | `DELETE` | DELETED | critical |

---

## 4. Business flow suy ra từ UI
- **Flow Name:** test-slug lifecycle observed from UI
- **Observed States:** `DRAFT → APPROVED → SUBMITTED → CANCELLED → DELETED`
- **Observed Actions:** `Approve`, `Save Draft`, `Submit`, `Submit Order Error`, `Cancel`, `Delete`

---

## 5. State và transition
```text
SUBMITTED ──(Approve)──> APPROVED
INITIAL ──(Save Draft)──> DRAFT
DRAFT ──(Submit)──> SUBMITTED
DRAFT ──(Submit Order Error)──> SUBMITTED
DRAFT ──(Cancel)──> CANCELLED
ANY ──(Delete)──> DELETED
```

---

## 6. Permission quan sát được
- Visibility Policy: Một số button hiển thị trực tiếp mà không kiểm tra role chi tiết ở client.
- Mismatch Detected: 1 vị trí lệch quyền hiển thị vs backend.

---

## 7. Điểm khớp với tài liệu (MATCHED)
- Luồng chuyển trạng thái cơ bản DRAFT -> SUBMITTED khớp với thiết kế.

---

## 8. Điểm mâu thuẫn (CONFLICT & PERMISSION_CONFLICT)
### [PERMISSION_CONFLICT] Approve
- **Actual Behavior:** Button "Approve" hiển thị trên UI cho role Staff
- **Implemented Rule:** Source code API endpoint PUT /orders/:id/approve yêu cầu role ADMIN hoặc MANAGER
- **Expected Business Behavior:** Tài liệu SRS quy định chỉ Manager mới được nhìn thấy nút Approve
- **Question:** Role Staff có được phép nhìn thấy nút Approve không, hay button phải bị ẩn hoặc disabled

### [CONFLICT] Status
- **Actual Behavior:** UI cho phép chọn Status trực tiếp qua dropdown "Status"
- **Implemented Rule:** Source code cho phép update status qua PUT /orders/:id
- **Expected Business Behavior:** Business flow quy định status phải chuyển qua action buttons Submit -> Approve
- **Question:** Status được thay đổi trực tiếp qua dropdown hay bắt buộc qua action buttons theo quy trình


---

## 9. Rule chưa rõ (AMBIGUOUS & UNRESOLVED)
- **[FRONTEND_BACKEND_VALIDATION_MISMATCH]** Form field "Amount" là field bắt buộc (required) trên UI → _Field "Amount" là bắt buộc hay optional, và backend chấp nhận giá trị nhỏ nhất là bao nhiêu_
- **[HIDE_VS_DISABLED_PERMISSION_POLICY]** Nút "Approve" đang hiển thị trên UI → _Khi user không có quyền, button "Approve" nên bị ẩn hoàn toàn hay chỉ disabled_
- **[HIDE_VS_DISABLED_PERMISSION_POLICY]** Nút "Delete" đang hiển thị trên UI → _Khi user không có quyền, button "Delete" nên bị ẩn hoàn toàn hay chỉ disabled_
- **[NEGATIVE_NUMBER_INPUT_RULE]** UI cho phép nhập vào field "Amount" → _Field "Amount" có cho phép nhập số âm hoặc bằng 0 không_
- **[MENU_VS_SOURCE_PERMISSION_MISMATCH]** Sidebar có menu "Payment Settings" → _Menu "Payment Settings" dành cho role nào và backend đã có API tương ứng chưa_
- **[PERMISSION_CONFLICT]** undefined → _Role Staff có được phép nhìn thấy nút Approve không, hay button phải bị ẩn hoặc disabled_
- **[AMBIGUOUS]** undefined → _Nút Save Draft và Submit tạo ra trạng thái và yêu cầu dữ liệu bắt buộc khác nhau như thế nào_
- **[AMBIGUOUS]** undefined → _Nút Cancel sẽ reset dữ liệu nhập hay quay lại trang trước_
- **[AMBIGUOUS]** undefined → _Hành động Delete là soft delete hay permanent delete khỏi cơ sở dữ liệu_

---

## 10. Q&A cần BA, PO, Dev xác nhận
| Question ID | Owner | Target Component | Question | Status | Severity |
|:---|:---:|:---|:---|:---:|:---:|
| `UI-QA-38E43CFD79` | **BA** | Approve | Role Staff có được phép nhìn thấy nút Approve không, hay button phải bị ẩn hoặc disabled | `OPEN` | High |
| `UI-QA-030C06EFFF` | **PO** | Save Draft | Nút Save Draft và Submit tạo ra trạng thái và yêu cầu dữ liệu bắt buộc khác nhau như thế nào | `OPEN` | Medium |
| `UI-QA-24D5A86289` | **BA** | Cancel | Nút Cancel sẽ reset dữ liệu nhập hay quay lại trang trước | `OPEN` | Low |
| `UI-QA-7074F4C4D4` | **BA** | Delete | Hành động Delete là soft delete hay permanent delete khỏi cơ sở dữ liệu | `OPEN` | Medium |
| `UI-QA-8EC9F1C833` | **Dev** | Status | Status được thay đổi trực tiếp qua dropdown hay bắt buộc qua action buttons theo quy trình | `OPEN` | High |
| `UI-QA-A03DD00BFB` | **BA** | Cancel button | Hành động Cancel có được thực hiện sau khi đơn đã ở trạng thái Approved không | `OPEN` | High |

---

## 11. Risk và testcase đề xuất
- **Testcase 1 (Boundary):** Kiểm tra gửi số âm/invalid vào form field.
- **Testcase 2 (Permission):** Login bằng Staff role và click nút Approve → Verify 403 Forbidden.
- **Testcase 3 (State):** Thử đổi Status trực tiếp qua API bypassing UI action buttons.
- **Testcase 4 (Runtime Verification):** Submit form và verify API ngầm trả HTTP 2xx (không bị lỗi HTTP 500 ngầm).

---

## 12. Evidence và source reference
- UI Components: `qa-knowledge/ui-business/test-slug/ui-components.json`
- Observed Flow: `qa-knowledge/ui-business/test-slug/observed-flow.json`
- Conflicts: `qa-knowledge/ui-business/test-slug/business-conflicts.json`
- State Graph: `qa-knowledge/ui-business/test-slug/ui-state-graph.json`
- Q&A Lifecycle: `qa-knowledge/ui-business/test-slug/question-lifecycle.json`
- Impact Map: `qa-knowledge/ui-business/test-slug/ui-business-impact-map.json`

---

## ⚠️ Summary: Missing Sources & Exploration Coverage
- **Nguồn bằng chứng đang thiếu:** Source file & API payload cho một số nút UI-only (xem `missingEvidence` array trong `business-conflicts.json`).
- **State chưa khám phá:** Các state phụ thuộc backend trigger như `REFUNDED`.
- **Role chưa test:** Admin role (chưa có credentials trong `auth.json`).
- **Action bị Safety Guard chặn:** Destructive Delete action và Payment checkout action.
- **Transition inferred:** Các transition chưa được runtime confirm qua HTTP request.
