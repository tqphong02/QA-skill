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
    ├── execute-sheet.mjs             # Script điều phối chính (Node.js)
    ├── drive_sheet_execute.py        # Script đọc/ghi file Excel local .xlsx (Python)
    └── drive_common.py               # Thư viện phụ trợ
```

---

## 🚀 3. Cách Đưa Đường Dẫn (Path) File Excel Local Của Bạn Vào Lệnh

Bạn có thể truyền **bất kỳ đường dẫn file Excel `.xlsx` nào trên máy tính của bạn** vào tham số `--excel-file`:

### 🔹 Ví dụ 1: File Excel nằm ở bất kỳ đâu trên máy cá nhân
```bash
# Đường dẫn tuyệt đối trên macOS / Linux:
node qa-run/scripts/execute-sheet.mjs --excel-file "/Users/intern/Downloads/KichBanKiemThu.xlsx" --sheet-name "Test cases_App"

# Đường dẫn tuyệt đối trên Windows:
node qa-run/scripts/execute-sheet.mjs --excel-file "D:/Testing/KichBanKiemThu.xlsx" --sheet-name "Test cases_App"
```

### 🔹 Ví dụ 2: File Excel nằm ngay trong thư mục làm việc (Đường dẫn tương đối)
```bash
node qa-run/scripts/execute-sheet.mjs --excel-file "./KichBanKiemThu.xlsx" --sheet-name "Test cases_App"
```

### 🔹 Ví dụ 3: Chạy Lọc theo Module Cụ Thể
```bash
# Chỉ chạy duy nhất Module LOGIN:
node qa-run/scripts/execute-sheet.mjs --excel-file "./KichBanKiemThu.xlsx" --module "LOGIN"

# Chỉ chạy duy nhất Module ORDER:
node qa-run/scripts/execute-sheet.mjs --excel-file "./KichBanKiemThu.xlsx" --module "ORDER"
```

---

## ⚡ 4. Cấu Hình Chạy Đa Tiến Trình (Multi-Worker Parallel Mode)

Khi file Excel có nhiều Module (ví dụ: `LOGIN`, `PRODUCT`, `CART`, `CHECKOUT`, `PROFILE`...), bạn có thể kích hoạt chế độ **Parallel Workers** để chia các module cho nhiều trình duyệt Playwright chạy đồng thời:

```bash
# Kích hoạt 4 Workers chạy song song chia theo các Module:
node qa-run/scripts/execute-sheet.mjs --excel-file "./KichBanKiemThu.xlsx" --parallel --workers 4

# Kích hoạt 8 Workers cho các máy cấu hình mạnh:
node qa-run/scripts/execute-sheet.mjs --excel-file "./KichBanKiemThu.xlsx" --parallel --workers 8
```

### 🧠 Cơ chế Chia Module của Multi-Worker Engine:
1. Script tự động gom nhóm các testcases trong Excel theo cột `Module` hoặc `Group`.
2. Phân chia đều các nhóm Module vào `N` Workers (`Worker #1`, `Worker #2`, `Worker #3`, `Worker #4`).
3. Các Workers mở nhiều cửa sổ trình duyệt Playwright độc lập để chạy đồng thời.
4. Tự động ghi nhận và batch-update kết quả `Pass`/`Fail` về lại file Excel sau khi tất cả Workers hoàn thành.

---

## 📊 4. Kết quả Sau khi Chạy
1. **File Excel của Intern được Cập nhật Trực tiếp**:
   - Cột `Result`: Tự động điền `Pass` hoặc `Fail`.
   - Cột `Date`: Ngày thực thi `YYYY-MM-DD`.
   - Cột `Tester`: Ghi nhận `AI-Agent / Playwright`.
   - Cột `Note`: Lời giải thích kết quả ngắn gọn, dễ hiểu.
2. **Ảnh Bằng chứng Evidence**:
   - Tự động chụp ảnh màn hình lưu tại thư mục `evidence/`.
