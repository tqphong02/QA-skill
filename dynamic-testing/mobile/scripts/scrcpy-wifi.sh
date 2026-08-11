#!/usr/bin/env bash

set -u

if [ "${1:-}" = "--help" ]; then
  printf '%s\n' "Usage: $0 [scrcpy options]"
  printf '%s\n' "Environment: ADB_BIN, SCRCPY_BIN, SCRCPY_WIFI_PORT"
  exit 0
fi

resolve_binary() {
  local override="$1"
  local bundled="$2"
  local command_name="$3"

  if [ -n "$override" ] && [ -x "$override" ]; then
    printf '%s\n' "$override"
  elif [ -x "$bundled" ]; then
    printf '%s\n' "$bundled"
  elif command -v "$command_name" >/dev/null 2>&1; then
    command -v "$command_name"
  fi
}

android_adb="$(resolve_binary "${ADB_BIN:-}" "${HOME}/scrcpy/adb" adb)"
android_scrcpy="$(resolve_binary "${SCRCPY_BIN:-}" "${HOME}/scrcpy/scrcpy" scrcpy)"
wifi_port="${SCRCPY_WIFI_PORT:-5555}"

if [ -z "$android_adb" ]; then
  printf '%s\n' "scrcpy-wifi: không tìm thấy adb; set ADB_BIN hoặc cài Android platform-tools" >&2
  exit 1
fi

if [ -z "$android_scrcpy" ]; then
  printf '%s\n' "scrcpy-wifi: không tìm thấy scrcpy; set SCRCPY_BIN hoặc cài scrcpy" >&2
  exit 1
fi

wifi_serial=$("$android_adb" devices | awk -v port="$wifi_port" '$1 ~ (":" port "$") && $2=="device"{print $1; exit}')

if [ -z "$wifi_serial" ]; then
  usb_serial=$("$android_adb" devices | awk '$2=="device" && $1 !~ /:/{print $1; exit}')
  if [ -z "$usb_serial" ]; then
    printf '%s\n' "scrcpy-wifi: không thấy thiết bị nào; cắm cáp USB, bật USB debugging rồi thử lại" >&2
    exit 1
  fi

  wifi_ip=$("$android_adb" -s "$usb_serial" shell ip -o -f inet addr show wlan0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1)
  if [ -z "$wifi_ip" ]; then
    printf '%s\n' "scrcpy-wifi: không lấy được IP Wi-Fi; bật Wi-Fi trên điện thoại rồi thử lại" >&2
    exit 1
  fi

  printf 'scrcpy-wifi: bật tcpip và kết nối %s:%s\n' "$wifi_ip" "$wifi_port"
  "$android_adb" -s "$usb_serial" tcpip "$wifi_port" >/dev/null 2>&1
  sleep 2

  if ! "$android_adb" connect "$wifi_ip:$wifi_port" 2>&1 | grep -qi "connected to"; then
    printf '%s\n' "scrcpy-wifi: connect lỗi, reset adb server rồi thử lại"
    "$android_adb" kill-server >/dev/null 2>&1
    "$android_adb" start-server >/dev/null 2>&1
    sleep 1
    "$android_adb" connect "$wifi_ip:$wifi_port" >/dev/null 2>&1
  fi

  wifi_serial="$wifi_ip:$wifi_port"
fi

if ! "$android_adb" devices | awk -v serial="$wifi_serial" '$1==serial && $2=="device"{found=1} END{exit !found}'; then
  printf 'scrcpy-wifi: không kết nối được %s; cắm lại USB rồi chạy lại\n' "$wifi_serial" >&2
  exit 1
fi

printf 'scrcpy-wifi: mirror %s\n' "$wifi_serial"
exec "$android_scrcpy" --serial "$wifi_serial" "$@"
