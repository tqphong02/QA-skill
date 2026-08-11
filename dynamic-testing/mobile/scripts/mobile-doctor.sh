#!/usr/bin/env bash

set -u

usage() {
  printf '%s\n' "Usage: $0 --android|--ios|--all"
}

mode="${1:-}"
case "$mode" in
  --android|--ios|--all) ;;
  *)
    usage >&2
    exit 2
    ;;
esac

status=0

check_command() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    printf 'PASS command=%s path=%s\n' "$name" "$(command -v "$name")"
  else
    printf 'FAIL command=%s classification=runtime_missing\n' "$name"
    status=1
  fi
}

resolve_adb() {
  if [ -n "${ADB_BIN:-}" ] && [ -x "${ADB_BIN}" ]; then
    printf '%s\n' "${ADB_BIN}"
  elif [ -x "${HOME}/scrcpy/adb" ]; then
    printf '%s\n' "${HOME}/scrcpy/adb"
  elif command -v adb >/dev/null 2>&1; then
    command -v adb
  fi
}

resolve_android_sdk() {
  local candidate
  for candidate in \
    "${ANDROID_HOME:-}" \
    "${ANDROID_SDK_ROOT:-}" \
    "${HOME}/Library/Android/sdk" \
    "${HOME}/Android/Sdk"; do
    if [ -n "$candidate" ] && [ -d "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
}

printf 'INFO mcp_check=manual classification=mcp_not_loaded_if_tools_absent required_tools=select_device,appium_session_management\n'
check_command node
check_command java
check_command npx

if command -v appium >/dev/null 2>&1; then
  printf 'PASS appium_cli=%s\n' "$(command -v appium)"
else
  printf '%s\n' "WARN appium_cli=missing impact=local_cli_only mcp_may_still_manage_runtime"
fi

if command -v codex >/dev/null 2>&1; then
  mcp_names="$(codex mcp list 2>/dev/null || true)"
  if printf '%s\n' "$mcp_names" | grep -qi appium; then
    printf '%s\n' "PASS mcp_client=codex server=appium"
  else
    printf '%s\n' "WARN mcp_client=codex server=appium classification=mcp_not_configured_or_not_loaded"
  fi
fi

if [ "$mode" = "--android" ] || [ "$mode" = "--all" ]; then
  android_adb="$(resolve_adb)"
  if [ -n "$android_adb" ]; then
    printf 'PASS android_adb=%s\n' "$android_adb"
    "$android_adb" devices -l || status=1
  else
    printf 'FAIL android_adb=missing classification=runtime_missing\n'
    status=1
  fi

  android_sdk="$(resolve_android_sdk)"
  if [ -n "$android_sdk" ]; then
    printf 'PASS android_sdk=%s\n' "$android_sdk"
    if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
      printf '%s\n' "WARN android_sdk_env=missing using=default_path"
    fi
  else
    printf 'FAIL android_sdk=missing_or_invalid classification=runtime_missing expected=ANDROID_HOME_or_ANDROID_SDK_ROOT\n'
    status=1
  fi

  if [ -x "${HOME}/scrcpy/scrcpy" ] || command -v scrcpy >/dev/null 2>&1; then
    printf 'PASS scrcpy=available\n'
  else
    printf 'WARN scrcpy=missing impact=wifi_mirroring_only\n'
  fi
fi

if [ "$mode" = "--ios" ] || [ "$mode" = "--all" ]; then
  check_command xcodebuild
  check_command xcrun
  if command -v xcrun >/dev/null 2>&1; then
    xcrun simctl list devices available || status=1
  fi
fi

exit "$status"
