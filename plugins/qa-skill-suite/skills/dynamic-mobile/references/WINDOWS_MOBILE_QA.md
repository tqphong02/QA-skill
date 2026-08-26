# Windows mobile QA

Use this guide for Android Appium, scrcpy, and authorized mobile-network inspection on Windows 10 or 11. Local iOS Simulator and real-device XCUITest execution require macOS with Xcode; from Windows, route iOS to a macOS self-hosted runner or a licensed device farm.

## Contents

- [Support boundary](#support-boundary)
- [Install prerequisites](#install-prerequisites)
- [Configure Android SDK](#configure-android-sdk)
- [Run readiness checks](#run-readiness-checks)
- [Connect and mirror Android](#connect-and-mirror-android)
- [Run Appium automation](#run-appium-automation)
- [Inspect mobile network traffic](#inspect-mobile-network-traffic)
- [Configure an Android device proxy](#configure-an-android-device-proxy)
- [Handle HTTPS certificates](#handle-https-certificates)
- [Capture with mitmproxy](#capture-with-mitmproxy)
- [Use Fiddler Everywhere MCP](#use-fiddler-everywhere-mcp)
- [Analyze and sanitize HAR](#analyze-and-sanitize-har)
- [Clean up](#clean-up)

## Support boundary

| Capability | Windows |
|---|---|
| Android emulator and real device | Supported |
| Appium UiAutomator2 | Supported |
| scrcpy over USB or TCP/IP | Supported |
| mitmproxy CLI and HAR export | Supported |
| Fiddler Everywhere and official MCP | Supported with product prerequisites |
| Charles and HTTP Toolkit | Supported as explicit fallbacks |
| Proxyman desktop/MCP | Use the macOS route |
| iOS Simulator/XCUITest local | Not supported; requires macOS/Xcode |

Never present a mirrored scrcpy screen as automation coverage. Appium must create or attach to a real session and assert state.

## Install prerequisites

Install:

- Git
- Node.js LTS
- JDK supported by the selected Android/Appium toolchain
- Android Studio with Android SDK Platform-Tools and an emulator image when needed
- Python 3 for the bundled HAR analyzer
- scrcpy from its official Genymobile distribution

The official scrcpy Windows package is available through:

```powershell
winget install --exact Genymobile.scrcpy
```

Do not download repackaged scrcpy binaries from unofficial sites. Install mitmproxy from its official Windows installer when headless capture is required. Install Fiddler Everywhere only when the user has selected that licensed route.

## Configure Android SDK

Android Studio commonly installs the SDK at:

```text
%LOCALAPPDATA%\Android\Sdk
```

Configure the current PowerShell session:

```powershell
$androidSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$env:ANDROID_HOME = $androidSdk
$env:ANDROID_SDK_ROOT = $androidSdk
$env:Path = "$androidSdk\platform-tools;$androidSdk\emulator;$env:Path"
```

Persist the two SDK variables for the current Windows user:

```powershell
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $androidSdk, "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $androidSdk, "User")
```

Add `%LOCALAPPDATA%\Android\Sdk\platform-tools` and `%LOCALAPPDATA%\Android\Sdk\emulator` to the user `Path` through Windows Environment Variables. Open a new terminal and verify:

```powershell
adb version
adb devices -l
```

## Run readiness checks

From the skill directory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\mobile-doctor.ps1 `
  -Mode android
```

The doctor checks Node, Java, Android SDK, ADB, connected devices, scrcpy, Appium CLI visibility, and Codex MCP configuration without installing software or changing device state.

An Appium MCP line is advisory. The active agent session must still expose `select_device` and `appium_session_management`.

## Connect and mirror Android

For USB bootstrap:

1. Enable Developer options and USB debugging
2. Connect and unlock the device
3. Accept the host RSA fingerprint
4. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\scrcpy-wifi.ps1
```

Pass scrcpy arguments after `--`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\scrcpy-wifi.ps1 `
  -- --turn-screen-off --stay-awake
```

For Android 11+ Wireless debugging, pair once from Developer options, then connect the runtime endpoint:

```powershell
adb pair 192.168.1.50:37123
adb connect 192.168.1.50:42177

powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\scrcpy-wifi.ps1 `
  -ConnectEndpoint 192.168.1.50:42177
```

The pairing endpoint and connection endpoint can use different dynamic ports. Do not assume port `5555` for Android Wireless debugging.

## Run Appium automation

Use this order:

1. Run the doctor
2. Resolve the exact APK, app ID, environment, account, and device matrix
3. Confirm the active MCP session exposes Appium tools
4. Call `select_device`; do not guess the device serial
5. Create a UiAutomator2 session with explicit capabilities
6. Capture a baseline screenshot and app/device metadata
7. Locate by accessibility ID, ID, Android UiAutomator, then scoped XPath
8. Execute an action and assert the resulting state
9. Generate Page Object Model code only from the verified journey when requested
10. Save evidence and delete owned sessions

When MCP is unavailable and maintainable CI code is requested, run `scripts/scaffold-wdio.sh` from Git Bash/WSL, or copy `assets/wdio-template` into the target repository. Keep selectors in Page Objects and capabilities in environment-aware configuration.

Windows can run Android CI only when the runner actually has an emulator, attached device, self-hosted device, or remote device-farm allocation. A repository workflow cannot use the developer's local phone unless that machine is registered and isolated as a self-hosted runner.

## Inspect mobile network traffic

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\network-proxy-doctor.ps1
```

Select exactly one route:

- Fiddler Everywhere MCP for interactive Windows inspection when licensed and configured
- `mitmdump` for deterministic CLI, scripts, and CI
- Charles or HTTP Toolkit only when already selected by the team

Do not combine multiple proxies on the same device route.

## Configure an Android device proxy

For a real device:

1. Put the Windows host and Android test device on the same reachable network
2. Obtain the host IPv4 address with `ipconfig`
3. Allow inbound access to the selected proxy port only on the test network
4. Enable remote-device connections in the proxy tool
5. Set the Android Wi-Fi proxy to the host IPv4 and selected port
6. Verify plain HTTP routing before installing any CA

For the Android emulator, use `10.0.2.2` to reach the Windows host. Prefer the Android System Proxy for inspecting app HTTPS traffic. The emulator `-http-proxy` tunnel is intended for network routing and does not itself decrypt HTTPS.

Fiddler Everywhere uses port `8866` by default for remote-device traffic. mitmproxy examples in this skill use port `8080`.

Do not bind a proxy broadly on an untrusted network. Limit exposure with the Windows firewall, a test VLAN, or an isolated hotspot.

## Handle HTTPS certificates

Install a proxy CA only on an authorized test device or emulator:

1. Start the selected proxy
2. Route the device to it
3. Open the proxy onboarding URL
4. Install the CA through Android security settings
5. Verify the CA appears under user credentials
6. Test an allowed HTTPS domain

For mitmproxy, open:

```text
http://mitm.it
```

For Fiddler Everywhere remote Android capture, use:

```text
http://<windows-host-ip>:8866
```

Android 7+ applications do not automatically trust user-installed CAs. Use an authorized debug build whose `network_security_config` opts into the user trust store. Do not patch certificate pinning or weaken a release or third-party app.

## Capture with mitmproxy

Create an evidence directory outside the application source when captures may contain sensitive data:

```powershell
$evidence = Join-Path $env:TEMP "mobile-network-evidence"
New-Item -ItemType Directory -Force -Path $evidence | Out-Null

mitmdump `
  --listen-host 0.0.0.0 `
  --listen-port 8080 `
  --set "hardump=$evidence\mobile.har"
```

Stop `mitmdump` gracefully with `Ctrl+C` so the HAR is written. Apply domain filters and redact secrets before retaining or sharing evidence.

## Use Fiddler Everywhere MCP

Prerequisites include the current Fiddler Everywhere application, a supported subscription, login, internet access, a generated MCP API key, and an MCP-capable client.

Configure from Fiddler Everywhere:

1. Open `Settings > MCP Server`
2. Select the coding-agent configuration
3. Choose Codex CLI when available, or use the manual HTTP settings
4. Keep the generated API key outside the repository
5. Restart or reload Codex
6. Confirm the Fiddler MCP tools are visible
7. Call `get_status` before capture

The default local MCP endpoint is:

```text
http://localhost:8868/mcp
```

Do not print or commit the `Authorization` API key. For remote Android capture, separately enable `Settings > Connections > Allow remote devices to connect`.

## Analyze and sanitize HAR

Run:

```powershell
python .\scripts\analyze-mobile-har.py `
  C:\absolute\path\mobile.har `
  --slow-ms 1000 `
  --format markdown `
  --output C:\absolute\path\mobile-network-summary.md
```

The analyzer excludes headers, cookies, query values, and bodies from its summary. The source HAR may still contain secrets and personal data; keep it restricted and delete it according to the evidence policy.

## Clean up

After every run:

1. Stop Appium recordings and proxy capture
2. Export and sanitize required evidence before clearing sessions
3. Remove Rewrite, Breakpoint, Map, throttling, replay, and scripting rules
4. Reset the Android Wi-Fi proxy to `None`
5. Remove temporary test CA trust when the test contract requires it
6. Remove temporary Windows firewall rules
7. Restore VPN and system-proxy state
8. Disconnect ADB TCP/IP when no longer required:

```powershell
adb disconnect
```

9. Delete only Appium sessions owned by the run
10. Report cleanup status and anything that could not be restored
