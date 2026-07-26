# Hướng Dẫn Sử Dụng Skill Thực Thi Test Case Excel Local (Cho Intern QA)

Chào mừng bạn đến với bộ công cụ tự động hóa kiểm thử **QA Excel Execution**. Skill `qa-run` đã tích hợp đầy đủ công cụ để tự động đọc, thực thi và cập nhật kết quả kiểm thử trực tiếp từ **file Excel (.xlsx) local** trên máy cá nhân của bạn.

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

## 📂 2. Cấu trúc Thư mục Skill `qa-run`

Skill `qa-run` hoạt động độc lập 100%, chứa sẵn tất cả các script thực thi:

```text
qa-run/
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
node qa-run/scripts/helpers/execute-sheet.mjs --excel-file "/Users/intern/Downloads/KichBanKiemThu.xlsx" --sheet-name "Test cases_App" --plan-only

# Đường dẫn tuyệt đối trên Windows:
node qa-run/scripts/helpers/execute-sheet.mjs --excel-file "D:/Testing/KichBanKiemThu.xlsx" --sheet-name "Test cases_App" --plan-only
```

### 🔹 Ví dụ 2: File Excel nằm ngay trong thư mục làm việc (Đường dẫn tương đối)
```bash
node qa-run/scripts/helpers/execute-sheet.mjs --excel-file "./KichBanKiemThu.xlsx" --sheet-name "Test cases_App" --plan-only
```

### 🔹 Ví dụ 3: Chạy Lọc theo Module Cụ Thể
```bash
# Chỉ chạy duy nhất Module LOGIN:
node qa-run/scripts/helpers/execute-sheet.mjs --excel-file "./KichBanKiemThu.xlsx" --module "LOGIN" --plan-only

# Chỉ chạy duy nhất Module ORDER:
node qa-run/scripts/helpers/execute-sheet.mjs --excel-file "./KichBanKiemThu.xlsx" --module "ORDER" --plan-only
```

---

## ⚡ 4. Cấu Hình Chạy Đa Tiến Trình (Multi-Worker Parallel Mode)

Khi file Excel có nhiều Module (ví dụ: `LOGIN`, `PRODUCT`, `CART`, `CHECKOUT`, `PROFILE`...), bạn có thể kích hoạt chế độ **Parallel Workers** để chia các module cho nhiều trình duyệt Playwright chạy đồng thời:

```bash
# Bước 1: tạo worker plan, chưa chạy và chưa sửa Excel
node qa-run/scripts/helpers/execute-sheet.mjs \
  --excel-file "./KichBanKiemThu.xlsx" \
  --parallel \
  --workers 4 \
  --plan-only

# Bước 2: sau khi xem plan, chọn worker và import kết quả đã có evidence
node qa-run/scripts/helpers/execute-sheet.mjs \
  --excel-file "./KichBanKiemThu.xlsx" \
  --parallel \
  --workers 4 \
  --selected-workers all \
  --results-file "./worker-results.json"
```

### 🧠 Cơ chế Chia Module của Multi-Worker Engine:
1. Script đọc đúng tab `Test cases_App`, header row 9 và gom testcase theo functional group
2. Mỗi assignment chứa tối đa hai functional groups; `--workers` giới hạn concurrency từ 1 đến 4
3. Script hiển thị plan và bắt buộc chọn `all`, worker ID như `1,2`, hoặc `cancel`
4. Browser worker/sub-agent thực thi testcase và trả JSON có evidence
5. Script chỉ batch-update khi kết quả đủ testcase, đúng schema và `Pass`/`Fail` có evidence
6. Nếu thiếu lựa chọn, executor hoặc evidence thì dừng `BLOCKED` và không sửa Excel

---

## 📊 4. Kết quả Sau khi Chạy
1. **File Excel của Intern được Cập nhật Trực tiếp**:
   - Cột `Result`: Chỉ điền `Pass`, `Fail`, `N/A` hoặc `Untest` sau validation.
   - Cột `Date`: Ngày thực thi `YYYY-MM-DD`.
   - Cột `Tester`: Ghi nhận tester do worker cung cấp.
   - Cột `Note`: Lời giải thích kết quả ngắn gọn, dễ hiểu.
2. **Ảnh Bằng chứng Evidence**:
   - Worker phải cung cấp đường dẫn hoặc URL evidence cho mọi kết quả `Pass` và `Fail`.
