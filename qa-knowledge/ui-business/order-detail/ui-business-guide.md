# UI Business Reconciliation: order-detail

> **Được sinh tự động bởi UI_BUSINESS_RECONCILIATION**  
> Sinh lúc: 2026-07-23T16:00:40.534Z  
> Nguồn: `/Users/user/QA-skill/qa-knowledge/ui-business/order-detail`

---

## 1. Tổng quan mục tiêu trang
Trang `order-detail` phục vụ quản lý chu trình nghiệp vụ đối tượng hệ thống. Cung cấp các thao tác tạo mới, cập nhật, gửi duyệt, phê duyệt và theo dõi trạng thái.

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
| `Cancel` | secondary_action_button | `CANCEL` | CANCELLED | medium |
| `Delete` | secondary_action_button | `DELETE` | DELETED | critical |

---

## 4. Business flow suy ra từ UI
- **Flow Name:** order-detail lifecycle observed from UI
- **Observed States:** `DRAFT → APPROVED → SUBMITTED → CANCELLED → DELETED`
- **Observed Actions:** `Approve`, `Save Draft`, `Submit`, `Cancel`, `Delete`

---

## 5. State và transition
```text
SUBMITTED ──(Approve)──> APPROVED
INITIAL ──(Save Draft)──> DRAFT
DRAFT ──(Submit)──> SUBMITTED
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
- **Observed UI:** Nút Approve hiển thị cho role Role: Staff
- **Document Rule:** Tài liệu ghi chỉ Manager/Admin được approve
- **Source Rule:** Source code permission API chỉ cho phép MANAGER và ADMIN
- **Question:** Role Staff có được phép nhìn thấy nút Approve không, hay button phải bị ẩn hoặc disabled

### [CONFLICT] Status
- **Observed UI:** Form cho phép chọn Status trực tiếp qua dropdown Status
- **Document Rule:** Business flow yêu cầu chuyển trạng thái từng bước qua Action Button (Submit -> Approve)
- **Source Rule:** Backend state machine yêu cầu transition qua PENDING -> APPROVED
- **Question:** Status được thay đổi trực tiếp qua dropdown hay bắt buộc qua action buttons theo quy trình


---

## 9. Rule chưa rõ (AMBIGUOUS & UNRESOLVED)
- **[FRONTEND_BACKEND_VALIDATION_MISMATCH]** Form field "Amount" là field bắt buộc (required) trên UI → _Field "Amount" là bắt buộc hay optional, và backend chấp nhận giá trị nhỏ nhất là bao nhiêu_
- **[HIDE_VS_DISABLED_PERMISSION_POLICY]** Nút "Approve" đang hiển thị trên UI → _Khi user không có quyền, button "Approve" nên bị ẩn hoàn toàn hay chỉ disabled_
- **[HIDE_VS_DISABLED_PERMISSION_POLICY]** Nút "Delete" đang hiển thị trên UI → _Khi user không có quyền, button "Delete" nên bị ẩn hoàn toàn hay chỉ disabled_
- **[NEGATIVE_NUMBER_INPUT_RULE]** UI cho phép nhập vào field "Amount" → _Field "Amount" có cho phép nhập số âm hoặc bằng 0 không_
- **[MENU_VS_SOURCE_PERMISSION_MISMATCH]** Sidebar có menu "Payment Settings" → _Menu "Payment Settings" dành cho role nào và backend đã có API tương ứng chưa_
- **[PERMISSION_CONFLICT]** Nút Approve hiển thị cho role Role: Staff → _Role Staff có được phép nhìn thấy nút Approve không, hay button phải bị ẩn hoặc disabled_
- **[AMBIGUOUS]** UI có cả hai nút Save Draft và Submit → _Nút Save Draft và Submit tạo ra trạng thái và yêu cầu dữ liệu bắt buộc khác nhau như thế nào_
- **[AMBIGUOUS]** UI có nút Cancel → _Nút Cancel sẽ reset dữ liệu nhập hay quay lại trang trước_
- **[AMBIGUOUS]** UI có nút Delete → _Hành động Delete là soft delete hay permanent delete khỏi cơ sở dữ liệu_

---

## 10. Q&A cần BA, PO, Dev xác nhận
| Question ID | Owner | Target Component | Question | Severity |
|:---|:---:|:---|:---|:---:|
| `UI-BIZ-ORDER-DETAIL-003` | **BA** | Approve | Role Staff có được phép nhìn thấy nút Approve không, hay button phải bị ẩn hoặc disabled | High |
| `UI-BIZ-ORDER-DETAIL-004` | **PO** | Save Draft | Nút Save Draft và Submit tạo ra trạng thái và yêu cầu dữ liệu bắt buộc khác nhau như thế nào | Medium |
| `UI-BIZ-ORDER-DETAIL-006` | **BA** | Cancel | Nút Cancel sẽ reset dữ liệu nhập hay quay lại trang trước | Low |
| `UI-BIZ-ORDER-DETAIL-007` | **BA** | Delete | Hành động Delete là soft delete hay permanent delete khỏi cơ sở dữ liệu | Medium |
| `UI-BIZ-ORDER-DETAIL-009` | **Dev** | Status | Status được thay đổi trực tiếp qua dropdown hay bắt buộc qua action buttons theo quy trình | High |
| `UI-QA-BA-E2D3AA` | **BA** | Cancel button | Hành động Cancel có được thực hiện sau khi đơn đã ở trạng thái Approved không | High |

---

## 11. Risk và testcase đề xuất
- **Testcase 1 (Boundary):** Kiểm tra gửi số âm/invalid vào form field.
- **Testcase 2 (Permission):** Login bằng Staff role và click nút Approve → Verify 403 Forbidden.
- **Testcase 3 (State):** Thử đổi Status trực tiếp qua API bypassing UI action buttons.

---

## 12. Evidence và source reference
- UI Components: `qa-knowledge/ui-business/order-detail/ui-components.json`
- Observed Flow: `qa-knowledge/ui-business/order-detail/observed-flow.json`
- Conflicts: `qa-knowledge/ui-business/order-detail/business-conflicts.json`
- Q&A: `qa-knowledge/ui-business/order-detail/clarification-qna.json`
