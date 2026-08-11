#!/usr/bin/env bash

set -euo pipefail

blocked() {
  printf 'BLOCKED: %s\n' "$*" >&2
  exit 1
}

require_env() {
  local name="$1"
  [ -n "${!name:-}" ] || blocked "$name is required for EXECUTION_TARGET=${EXECUTION_TARGET:-unset}"
}

require_command() {
  local name="$1"
  command -v "$name" >/dev/null 2>&1 || blocked "$name is not available"
}

verify_android_target() {
  require_command adb
  require_env ANDROID_UDID

  local state
  state="$(adb -s "$ANDROID_UDID" get-state 2>/dev/null || true)"
  [ "$state" = "device" ] || {
    adb devices -l >&2 || true
    blocked "declared Android target is missing, unauthorized, offline, or mismatched"
  }
}

execution_target="${EXECUTION_TARGET:-}"
[ -n "$execution_target" ] || blocked "EXECUTION_TARGET is not set"

case "$execution_target" in
  ci-emulator)
    [ "${CI:-}" = "true" ] || blocked "ci-emulator requires CI=true"
    require_env ANDROID_UDID
    case "$ANDROID_UDID" in
      emulator-*) ;;
      *) blocked "ci-emulator requires an emulator ANDROID_UDID" ;;
    esac
    verify_android_target
    boot_completed="$(adb -s "$ANDROID_UDID" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    [ "$boot_completed" = "1" ] || blocked "Android emulator has not completed boot"
    adb -s "$ANDROID_UDID" shell pm path android >/dev/null 2>&1 ||
      blocked "Android package manager is not ready"
    printf '%s\n' "OK: execution_target=ci-emulator device=resolved boot=complete"
    ;;

  ci-simulator)
    [ "${CI:-}" = "true" ] || blocked "ci-simulator requires CI=true"
    require_env IOS_SIMULATOR_UDID
    require_command xcrun
    simulator_state="$(
      xcrun simctl list devices |
        awk -v udid="$IOS_SIMULATOR_UDID" 'index($0, udid) && /\\(Booted\\)/ { print "Booted"; exit }'
    )"
    [ "$simulator_state" = "Booted" ] ||
      blocked "declared iOS Simulator is missing or not booted"
    printf '%s\n' "OK: execution_target=ci-simulator device=resolved boot=complete"
    ;;

  self-hosted-device)
    [ "${CI:-}" = "true" ] || blocked "self-hosted-device requires CI=true"
    require_env DEVICE_LABEL
    verify_android_target
    printf 'OK: execution_target=self-hosted-device label=%s device=resolved\n' "$DEVICE_LABEL"
    ;;

  remote-device-farm)
    [ "${CI:-}" = "true" ] || blocked "remote-device-farm requires CI=true"
    require_env APPIUM_REMOTE_SERVER_URL
    require_env REMOTE_DEVICE_CAPABILITIES_JSON
    case "$APPIUM_REMOTE_SERVER_URL" in
      https://*) ;;
      *) blocked "APPIUM_REMOTE_SERVER_URL must use HTTPS" ;;
    esac
    printf '%s\n' "OK: execution_target=remote-device-farm contract=resolved"
    ;;

  local-emulator)
    [ "${CI:-false}" != "true" ] || blocked "local-emulator is not allowed in CI"
    verify_android_target
    case "$ANDROID_UDID" in
      emulator-*) ;;
      *) blocked "local-emulator requires an emulator ANDROID_UDID" ;;
    esac
    printf '%s\n' "OK: execution_target=local-emulator device=resolved"
    ;;

  local-device)
    [ "${CI:-false}" != "true" ] || blocked "local-device is not allowed in CI"
    verify_android_target
    case "$ANDROID_UDID" in
      emulator-*) blocked "local-device requires a real-device ANDROID_UDID" ;;
    esac
    printf '%s\n' "OK: execution_target=local-device device=resolved"
    ;;

  *)
    blocked "unsupported EXECUTION_TARGET=$execution_target"
    ;;
esac
