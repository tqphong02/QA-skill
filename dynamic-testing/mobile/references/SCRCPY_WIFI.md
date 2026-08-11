# Kết nối scrcpy qua Wi-Fi

Script `../scripts/scrcpy-wifi.sh` được chuẩn hoá từ hàm `scrcpy-wifi` trong `~/.zshrc`. Trên Windows dùng `../scripts/scrcpy-wifi.ps1`.

Script macOS/Linux vẫn ưu tiên:

```text
~/scrcpy/adb
~/scrcpy/scrcpy
```

Nếu hai binary đó không tồn tại, script dùng `adb` và `scrcpy` trong `PATH`.

## Điều kiện

- Máy Android và máy tính ở cùng mạng Wi-Fi có thể truy cập lẫn nhau
- Đã bật Developer options và USB debugging
- Có cáp USB cho lần kết nối đầu
- Điện thoại đã mở khoá và đã chấp nhận RSA fingerprint của máy tính

## Kết nối lần đầu

1. Cắm điện thoại qua USB
2. Kiểm tra trạng thái:

   ```bash
   adb devices
   ```

3. Chạy script từ repo:

   ```bash
   ./dynamic-testing/mobile/scripts/scrcpy-wifi.sh
   ```

4. Script tự tìm thiết bị USB, lấy IPv4 của `wlan0`, bật ADB TCP/IP ở cổng `5555`, kết nối, xác nhận trạng thái `device`, rồi mở scrcpy
5. Khi màn hình đã mirror ổn định, có thể rút cáp USB

Lần sau, nếu `adb devices` vẫn có thiết bị `IP:5555` ở trạng thái `device`, script dùng lại kết nối đó.

## Giữ lệnh `scrcpy-wifi` trong zsh

Thay phần thân hàm cũ trong `~/.zshrc` bằng wrapper:

```zsh
scrcpy-wifi() {
  "${CODEX_HOME:-$HOME/.codex}/skills/dynamic-testing/mobile/scripts/scrcpy-wifi.sh" "$@"
}
```

Sau khi cài skill vào Codex:

```bash
source ~/.zshrc
scrcpy-wifi
```

Có thể truyền thêm tham số scrcpy:

```bash
scrcpy-wifi --turn-screen-off --stay-awake
```

## Windows PowerShell

Cài scrcpy chính chủ:

```powershell
winget install --exact Genymobile.scrcpy
```

Chạy USB bootstrap rồi mirror qua Wi-Fi:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\dynamic-mobile\scripts\scrcpy-wifi.ps1
```

Truyền tham số cho scrcpy sau `--`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\dynamic-mobile\scripts\scrcpy-wifi.ps1 `
  -- --turn-screen-off --stay-awake
```

Nếu Android 11+ đã pair bằng Wireless debugging, connect endpoint động rồi truyền endpoint đó:

```powershell
adb pair 192.168.1.50:37123
adb connect 192.168.1.50:42177

powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\dynamic-mobile\scripts\scrcpy-wifi.ps1 `
  -ConnectEndpoint 192.168.1.50:42177
```

Pairing port và connection port có thể khác nhau. Không mặc định cổng `5555` cho luồng Wireless debugging của Android 11+.

## Tuỳ chỉnh

```bash
ADB_BIN=/custom/path/adb \
SCRCPY_BIN=/custom/path/scrcpy \
SCRCPY_WIFI_PORT=5555 \
scrcpy-wifi
```

Trên Windows:

```powershell
$env:ADB_BIN = "C:\Android\platform-tools\adb.exe"
$env:SCRCPY_BIN = "C:\Tools\scrcpy\scrcpy.exe"

powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\dynamic-mobile\scripts\scrcpy-wifi.ps1 `
  -Port 5555
```

## Xác minh và xử lý lỗi

- `unauthorized`: mở khoá điện thoại và chấp nhận USB debugging
- Không lấy được IP: bật Wi-Fi và xác minh interface `wlan0`
- `No route to host`: kiểm tra cùng subnet, VPN, firewall và Wi-Fi client isolation
- `offline`: chạy `adb disconnect IP:5555`, cắm lại USB và chạy script lần nữa
- Android 11+ Wireless debugging bằng pairing code dùng cổng động; script này dùng luồng USB bootstrap `adb tcpip 5555`

Kết nối scrcpy chỉ mirror màn hình. Appium vẫn cần session riêng và `appium:udid` phải khớp serial mà `adb devices` đang báo.
