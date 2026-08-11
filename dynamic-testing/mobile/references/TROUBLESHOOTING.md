# Mobile QA troubleshooting

## Classify the failing layer

| Symptom | Classification | Action |
|---|---|---|
| Appium MCP absent from client server list | `mcp_not_configured` | Add the official `appium-mcp` stdio server |
| Server configured but tools absent in this turn | `mcp_not_loaded` | Restart/reload the MCP client and verify tools |
| `npx`, Node, Java, Android SDK, Xcode, or driver prerequisite missing | `runtime_missing` | Run the platform `mobile-doctor` and install only the missing prerequisite |
| Device access, USB trust, signing, or filesystem access denied | `permission_denied` | Fix the exact permission or trust boundary |
| Cloud/device-farm authentication fails | `auth_required` | Re-authenticate through the provider without pasting secrets into reports |

## Android

### ADB not found

Set `ANDROID_HOME` to the Android SDK and add its `platform-tools` directory to `PATH`, or set `ADB_BIN` for the bundled scripts. Confirm with `adb version`.

On Windows, run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/mobile-doctor.ps1 -Mode android` and read [WINDOWS_MOBILE_QA.md](WINDOWS_MOBILE_QA.md).

### Device is `unauthorized`

Unlock the device, accept the USB debugging fingerprint, then run `adb devices` again. Revoke USB debugging authorizations only when authorized because it affects other trusted hosts.

### Wi-Fi device is offline or unreachable

Confirm host and phone are on the same reachable network, disable client isolation or VPN interference, reconnect USB, and rerun `scripts/scrcpy-wifi.sh` or the Windows `scripts/scrcpy-wifi.ps1`. See [SCRCPY_WIFI.md](SCRCPY_WIFI.md).

### Session cannot create

Check that the resolved `udid`, APK path, package/activity, platform version, and UiAutomator2 prerequisites match the selected device. Capture the Appium error without exposing identifiers.

## iOS

### WebDriverAgent signing fails

Use `appium_prepare_ios_real_device` and choose the exact authorized provisioning profile. Confirm Developer Mode, device trust, Xcode account, team, bundle signing, and profile/device membership.

### Simulator cannot boot

Confirm the requested runtime exists with `xcrun simctl list devices available`, boot a compatible simulator, and rerun `prepare_ios_simulator`.

### Real device cannot launch the build

Confirm the IPA is signed for the selected device and that the app, WDA, team, and provisioning configuration are compatible.

## Element not found

1. Re-capture screenshot and page source
2. Confirm native/webview context
3. Retry with accessibility ID, ID, then native platform locator
4. Use `scroll_to_element` with the same locator
5. Wait for the documented state transition, not an arbitrary long sleep
6. Use scoped XPath only after stable strategies fail
7. Record coordinate or AI-vision fallback as technical debt

## Session disappears after client reconnect

The default Appium MCP disconnect policy deletes MCP-owned sessions. Set `APPIUM_MCP_ON_CLIENT_DISCONNECT=skip` only when transient disconnects must preserve sessions. Always delete those sessions explicitly afterward to avoid orphans.

## Mobile network capture

### Proxy runtime is unavailable

Run `scripts/network-proxy-doctor.sh` on macOS/Linux or `scripts/network-proxy-doctor.ps1` on Windows. Classify the missing layer as `mcp_not_configured`, `mcp_not_loaded`, `runtime_missing`, `license_required`, or `auth_required`. Do not claim MCP support merely because the desktop proxy app is installed.

### HTTP appears but HTTPS does not

Confirm the device proxy, CA installation, full trust, domain SSL scope, debug build network-security configuration, and device time. If the app still rejects interception, report `BLOCKED: certificate_pinning` or `BLOCKED: mTLS` rather than weakening a release build.

### Device cannot reach the proxy

Confirm the device and host are on the same reachable network, the proxy listens on a non-loopback interface when required, the host firewall allows the proxy port, and VPN or Wi-Fi client isolation is not blocking the route. Android emulators normally reach the host through `10.0.2.2`.

### Traffic bypasses the proxy

Check app-specific proxy bypass, QUIC/HTTP3, custom sockets, VPN conflicts, cached connections, and a stale system proxy. Capture limitations must remain visible in the report.

### HAR is missing WebSocket messages

HAR commonly preserves the handshake but not every message. Export a sanitized engine-native session or WebSocket summary and correlate it with the Appium timeline.
