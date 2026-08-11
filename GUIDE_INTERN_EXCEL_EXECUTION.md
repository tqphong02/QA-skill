# Hướng Dẫn Sử Dụng Skill Thực Thi Test Case Excel Local (Cho Intern QA)

Chào mừng bạn đến với bộ công cụ tự động hóa kiểm thử **QA Excel Execution**. Skill `dynamic-web-exploratory` đã tích hợp đầy đủ công cụ để tự động đọc, thực thi và cập nhật kết quả kiểm thử trực tiếp từ **file Excel (.xlsx) local** trên máy cá nhân của bạn.

---

## 🛠️ 1. Môi trường Yêu cầu

Đảm bảo máy tính của bạn đã cài đặt:
1. **Node.js**: Phiên bản 18 trở lên (`node -v`).
2. **Python 3**: Phiên bản 3.9 trở lên (`python3 --version`).
3. **Thư viện OpenPyXL**: Cài đặt bằng câu lệnh:
   ```bash
   pip install openpyxl
   ```
4. **Playwright Browser**: Cài đặt browser Playwright bằng lệnh:
   ```bash
   npx playwright install chromium
   ```

---

## 📂 2. Cấu trúc Thư mục Skill `dynamic-web-exploratory`

Skill `dynamic-web-exploratory` hoạt động độc lập 100%, chứa sẵn tất cả các script thực thi:

```text
dynamic-testing/web-exploratory/
├── SKILL.md                          # Thông tin quy chuẩn skill
└── scripts/
    └── helpers/
        ├── execute-sheet.mjs          # Script điều phối chính (Node.js)
        ├── drive_sheet_execute.py     # Script đọc/ghi file Excel local .xlsx (Python)
        └── drive_common.py            # Thư viện phụ trợ
```

---

## 🚀 3. Cách Đưa Đường Dẫn (Path) File Excel Local Của Bạn Vào Lệnh

Bạn có thể truyền **bất kỳ đường dẫn file Excel `.xlsx` nào trên máy tính của bạn** vào tham số `--excel-file`:

### 🔹 Ví dụ 1: File Excel nằm ở bất kỳ đâu trên máy cá nhân
```bash
# Đường dẫn tuyệt đối trên macOS / Linux:
node dynamic-testing/web-exploratory/scripts/helpers/execute-sheet.mjs --excel-file "/Users/intern/Downloads/KichBanKiemThu.xlsx" --sheet-name "Test cases_App" --plan-only

# Đường dẫn tuyệt đối trên Windows:
node dynamic-testing/web-exploratory/scripts/helpers/execute-sheet.mjs --excel-file "D:/Testing/KichBanKiemThu.xlsx" --sheet-name "Test cases_App" --plan-only
```

### 🔹 Ví dụ 2: File Excel nằm ngay trong thư mục làm việc (Đường dẫn tương đối)
```bash
node dynamic-testing/web-exploratory/scripts/helpers/execute-sheet.mjs --excel-file "./KichBanKiemThu.xlsx" --sheet-name "Test cases_App" --plan-only
```

### 🔹 Ví dụ 3: Chạy Lọc theo Module Cụ Thể
```bash
# Chỉ chạy duy nhất Module LOGIN:
node dynamic-testing/web-exploratory/scripts/helpers/execute-sheet.mjs --excel-file "./KichBanKiemThu.xlsx" --module "LOGIN" --parallel --plan-only

# Chỉ chạy duy nhất Module ORDER:
node dynamic-testing/web-exploratory/scripts/helpers/execute-sheet.mjs --excel-file "./KichBanKiemThu.xlsx" --module "ORDER" --parallel --plan-only
```

---

## ⚡ 4. Cấu Hình Chạy Đa Tiến Trình (Multi-Worker Parallel Mode)

Khi file Excel có nhiều Module (ví dụ: `LOGIN`, `PRODUCT`, `CART`, `CHECKOUT`, `PROFILE`...), bạn có thể kích hoạt chế độ **Parallel Workers** để chia các module cho nhiều trình duyệt Playwright chạy đồng thời:

```bash
# Bước 1: tạo worker plan, chưa chạy và chưa sửa Excel
node dynamic-testing/web-exploratory/scripts/helpers/execute-sheet.mjs \
  --excel-file "./KichBanKiemThu.xlsx" \
  --parallel \
  --plan-only

# Bước 2: xác nhận module, nhập số worker đã chọn và import kết quả có ảnh/video
node dynamic-testing/web-exploratory/scripts/helpers/execute-sheet.mjs \
  --excel-file "./KichBanKiemThu.xlsx" \
  --module "LOGIN" \
  --confirmed-module "LOGIN" \
  --parallel \
  --workers 2 \
  --selected-workers all \
  --results-file "./worker-results.json"
```

### 🧠 Cơ chế Chia Module của Multi-Worker Engine:
1. Script đọc đúng tab `Test cases_App`, header row 9 và gom testcase theo functional group
2. Script hiển thị requested/resolved/available module và bắt buộc xác nhận chính xác module
3. User chọn số worker từ 1 đến 4; một module như `LOGIN` được shard testcase theo số worker này
4. User tiếp tục chọn `all`, worker ID như `1,2`, hoặc `cancel`
5. Browser worker/sub-agent thực thi testcase; mỗi `Pass`/`Fail` phải có screenshot hoặc video
6. Script append media reference vào Note và chỉ batch-update khi đủ testcase, đúng schema, file evidence tồn tại
7. Nếu thiếu module confirmation, worker count, worker selection, executor hoặc visual evidence thì dừng `BLOCKED` và không sửa Excel
8. Media được tách theo `evidence/sheet/<functional-group>/<YYYY-MM-DD>/<run-id>/worker-<id>/`; JSON plan/result/write-back nằm ở `evidence/sheet/_runs/<YYYY-MM-DD>/<run-id>/`

---

## 📊 4. Kết quả Sau khi Chạy
1. **File Excel của Intern được Cập nhật Trực tiếp**:
   - Cột `Result`: Chỉ điền `Pass`, `Fail`, `N/A` hoặc `Untest` sau validation.
   - Cột `Date`: Ngày thực thi `YYYY-MM-DD`.
   - Cột `Tester`: Ghi nhận tester do worker cung cấp.
   - Cột `Note`: Lời giải thích kết quả ngắn gọn, dễ hiểu.
2. **Ảnh Bằng chứng Evidence**:
   - Worker phải cung cấp ít nhất một ảnh hoặc video cho từng kết quả `Pass` và `Fail`; JSON, trace hoặc network log đơn lẻ không đủ.
