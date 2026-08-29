---
name: dynamic-mobile
description: Plan, run, diagnose, and report Android/iOS QA with Appium, native tools, emulators, simulators, real devices, scrcpy, and authorized traffic capture. Trigger on mobile smoke/regression, APK/IPA, device matrices, HTTP/WebSocket/GraphQL/HAR traffic, Proxyman, Charles, mitmproxy, HTTP Toolkit, or Fiddler. Auto-route; do not require the skill name.
mode: dynamic
surface: mobile
role: executor
legacy_aliases: mobile-qa
---

<!-- qa-runs-contract:start -->
## Local run organization

When this workflow creates local reports, evidence, logs, converted intermediates, or other non-source deliverables and the user did not request an exact output path:

1. Start a fresh run with `node <skill-root>/scripts/qa-runs.mjs start --skill <skill-name> --label <short-scope>` when the bundled helper exists. In a QA-skill source checkout use `<repo-root>/scripts/qa-runs.mjs`. If neither helper exists, create the same layout manually
2. Keep every run-owned file under the returned `<project-root>/qa-runs/<skill-name>/<timestamp>_<scope>/` directory. Never emit generated files into the project root or overwrite an earlier run
3. Put the primary human-readable summary at `report.md` when the output format permits. Preserve required machine-readable and native filenames inside the same run directory
4. Finish the run with `qa-runs.mjs finish --run-dir <run-dir> --status <status> [--primary <report-path>]` so `LATEST.md`, `INDEX.md`, root `latest.json`, and per-skill `latest.json` point to the newest run
5. In the final response, link the primary report, the timestamped run directory, and `qa-runs/INDEX.md`; identify the run ID and status explicitly

An exact user path, a source-code deliverable that belongs in the target repository, or a safety-mandated location overrides this layout. Register or link the result without copying secrets or sensitive evidence into the index
<!-- qa-runs-contract:end -->
# Mobile QA

Treat platform, OS, device class, lifecycle and network state as explicit dimensions. Emulator evidence never proves real-device coverage

## Hard gates

- Resolve artifact checksum, application/bundle ID, environment, supported OS range, device scope, accounts, data and distribution authorization
- Before state-changing work record `Target`, `Operation`, `Required inputs`, `Write action` and `Verification`; define cleanup for app/device/session state
- Select the matrix from [DEVICE_MATRIX.md](references/DEVICE_MATRIX.md); do not claim coverage outside executed devices or lifecycle
- Keep credentials, signing files, provisioning profiles, personal data and raw device identifiers out of reports
- Ask immediately before purchases, messages, calls, notifications, deletion, destructive reset, proxy mutation or another material side effect
- Capture only an authorized app/environment/account/device/domain; redact headers, cookies, tokens, credentials and sensitive bodies
- Treat CA install, proxy/VPN, Rewrite, Breakpoint, Map, throttling, replay and request mutation as state changes with read-back/cleanup
- Do not bypass certificate pinning in a release or third-party app; use an authorized debug build or report `BLOCKED: certificate_pinning`

## Tool routing

- Appium MCP: interactive discovery, smoke/regression, gestures, locator learning, evidence and requested POM generation
- Android: `adb`, logcat, Android Studio and UiAutomator2; iOS: Xcode, `simctl`, device logs, WebDriverAgent and XCUITest
- Mirror Android only with `scripts/scrcpy-wifi.sh` or `.ps1`; mirroring is not automation/evidence
- Use `scripts/scaffold-wdio.sh` only for a deterministic WebdriverIO fallback; use `scripts/scaffold-mobile-ci.sh` for requested Android PR smoke CI
- Configure Antigravity Appium MCP with `scripts/configure-appium-mcp.py --agent antigravity`; keep the update atomic and backed up
- Use native accessibility inspection/screen reader for accessibility verdicts
- Prefer Proxyman MCP on macOS, `mitmdump` for headless/CI, Fiddler/Charles/HTTP Toolkit only when their licensed or explicit fallback route is configured

Read only the selected reference: [APPIUM_MCP.md](references/APPIUM_MCP.md), [MOBILE_CI.md](references/MOBILE_CI.md), [MOBILE_NETWORK_INSPECTION.md](references/MOBILE_NETWORK_INSPECTION.md), [PROXY_TOOL_MATRIX.md](references/PROXY_TOOL_MATRIX.md), [SCRCPY_WIFI.md](references/SCRCPY_WIFI.md), [WINDOWS_MOBILE_QA.md](references/WINDOWS_MOBILE_QA.md), or [TROUBLESHOOTING.md](references/TROUBLESHOOTING.md)

## Workflow

1. **Readiness** — run `scripts/mobile-doctor.sh --android|--ios|--all` or `scripts/mobile-doctor.ps1 -Mode android`. The doctor is advisory; the active MCP client proves tool availability. Windows/iOS routes to macOS self-hosted or an approved device farm
2. **Session** — resolve `mcp_not_configured`, `auth_required`, `runtime_missing`, `mcp_not_loaded` or `permission_denied`; call `select_device`, prepare the platform, create the Appium session and record `sessionId`, ownership, device, OS and build
3. **Install/launch** — verify checksum/version, clean install/upgrade when in scope, first launch, permissions, auth, foreground/background, restart and uninstall cleanup; capture initial screenshot and metadata
4. **Journey** — locate by accessibility ID → stable ID → platform semantic locator → scoped XPath. Scroll/inspect before declaring an element missing, use coordinates/vision only as a documented last resort, and assert state after every action
5. **Coverage** — include requested happy/validation/persistence/interruption/deep-link/notification/picker/biometric/network/locale/timezone/rotation/keyboard/gesture/permission/lifecycle states
6. **Network** — run the platform proxy doctor, select one engine, capture passively by default, correlate flows with UI steps and inspect method/host/path/status/latency/retry, auth refresh, GraphQL, WebSocket and authorized negative conditions
7. **Evidence/cleanup** — capture screenshots, video for timing/gesture/crash, logs for crash/ANR and sanitized HAR where supported; stop capture, remove temporary proxy/CA/VPN/rules, restore state and delete owned sessions

For HAR analysis use:

```text
python scripts/analyze-mobile-har.py /absolute/path/to/capture.har --format markdown
```

If HTTPS fails, distinguish CA trust, pinning, mTLS, proxy bypass, VPN conflict and unsupported protocol; never weaken the app silently

## Automation and CI

Generate code only when requested. Keep POM selectors out of specs and preserve verified assertions/capabilities. CI uses an explicit trusted `remoteServerUrl`, `EXECUTION_TARGET` and capabilities; do not call `select_device` in CI. Run `scripts/check-device-target.sh` before the runner so missing/offline/mismatched devices fail rather than produce skipped green tests

Fallback:

```text
dynamic-testing/mobile/scripts/scaffold-wdio.sh /absolute/path/to/dynamic-mobile-wdio
dynamic-testing/mobile/scripts/scaffold-mobile-ci.sh /absolute/path/to/target-repository
```

## Output and completion

Use [assets/bug-report-template.md](assets/bug-report-template.md) for reproduced bugs; suspicions remain candidates until reproduction and control comparison. Report execution contract, checksum/version, device matrix, scenario verdicts, evidence paths, findings, blocked/unsupported combinations, sanitized network/mutation ledger and cleanup status

Before `PASS`, confirm every action has a state assertion, pass/fail has screenshot/video, relevant network/permission recovery was checked, real-device claims have real-device evidence, crash/ANR has logs, proxy rules were authorized/read back, and created state/sessions were cleaned up
