# Hướng Dẫn Thực Thi Test Case Excel Local (Dành cho Intern QA)

Tài liệu này hướng dẫn Intern QA cách thực thi tự động các kịch bản kiểm thử (Testcases) từ **file Excel (.xlsx) local** hoặc **Google Sheet URL** bằng Playwright CLI.

---

## 🛠️ 1. Môi trường Yêu cầu

1. **Node.js**: Phiên bản 18+ (`node -v`).
2. **Python 3**: Phiên bản 3.9+ (`python3 --version`).
3. **Cài đặt thư viện Python (OpenPyXL)**:
   ```bash
   pip install openpyxl
   ```
4. **Cài đặt Playwright Browser**:
   ```bash
   npx playwright install chromium
   ```

---

## 🚀 2. Các Lệnh Thực Thi Thường Dùng

### 🔹 Trường hợp 1: Chạy Testcase từ File Excel Local (.xlsx)
```bash
# Chạy tất cả testcases trong file Excel local
node qa-run/scripts/execute-sheet.mjs --excel-file "./Template.xlsx" --sheet-name "Test cases_App"

# Chạy riêng 1 Module cụ thể (ví dụ: LOGIN)
node qa-run/scripts/execute-sheet.mjs --excel-file "./Template.xlsx" --module "LOGIN"

# Chạy tất cả testcases dạng song song (Parallel 4 workers)
node qa-run/scripts/execute-sheet.mjs --excel-file "./Template.xlsx" --parallel --workers 4
```

### 🔹 Trường hợp 2: Chạy Testcase từ Google Sheet URL
```bash
node qa-run/scripts/execute-sheet.mjs --sheet-url "https://docs.google.com/spreadsheets/d/1xxx/edit" --parallel
```

---

## 📊 3. Kết quả Sau khi Chạy
1. **File Excel được cập nhật tự động**:
   - Cột `Result`: Cập nhật tự động thành `Pass` hoặc `Fail`.
   - Cột `Date`: Ngày thực thi dạng `YYYY-MM-DD`.
   - Cột `Tester`: Ghi nhận `AI-Agent / Playwright`.
   - Cột `Note`: Nội dung giải thích kết quả ngắn gọn, thân thiện.
2. **Ảnh Bằng chứng Evidence**:
   - Chụp ảnh màn hình lưu tại thư mục `evidence/`.
