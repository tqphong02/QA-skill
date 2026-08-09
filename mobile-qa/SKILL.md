---
name: mobile-qa
description: Plan, run, diagnose, and report Android/iOS QA with Appium, native tools, emulators, simulators, real devices, scrcpy, and authorized traffic capture. Trigger on mobile smoke/regression, APK/IPA, device matrices, HTTP/WebSocket/GraphQL/HAR traffic, Proxyman, Charles, mitmproxy, HTTP Toolkit, or Fiddler. Auto-route; do not require the skill name.
---

# Mobile QA

Treat platform, OS, device class, lifecycle, and network state as explicit test dimensions. Never present emulator-only evidence as real-device coverage.

## Hard gates

1. Resolve the build artifact, application ID or bundle ID, environment, supported platforms and OS range, device scope, accounts, test data, and distribution authorization
2. Before a run that changes device or app state, record `Target`, `Operation`, `Required inputs`, `Write action`, and `Verification`
3. Verify the artifact checksum and installed build version before execution
4. Select the device matrix and lifecycle scope from [references/DEVICE_MATRIX.md](references/DEVICE_MATRIX.md)
5. Keep signing files, provisioning profiles, credentials, tokens, personal data, and raw device identifiers out of reports
6. Define cleanup for accounts, notifications, files, permissions, app data, sessions, and device state
7. Ask immediately before purchases, messages, calls, external notifications, account deletion, destructive data reset, or another material side effect
8. Do not claim coverage outside the executed device matrix
9. Intercept traffic only for an authorized app, environment, account, device, and domain scope
10. Treat CA installation, proxy changes, VPN profiles, Rewrite, Breakpoint, Map Local/Remote, throttling, replay, and request/response mutation as state changes with explicit cleanup
11. Redact authorization headers, cookies, tokens, credentials, personal data, and sensitive bodies before saving or sharing network evidence
12. Do not bypass certificate pinning in a release or third-party app; request an authorized debug build or report `BLOCKED: certificate_pinning`

## Route the request

- Use Appium MCP for interactive discovery, smoke, regression, exploratory checks, locator learning, gestures, evidence, and requested test-code generation
- Use `adb`, logcat, Android Studio, and UiAutomator2 for Android setup and diagnosis
- Use Xcode, `simctl`, device logs, WebDriverAgent, and XCUITest for iOS setup and diagnosis
- Use `scripts/scrcpy-wifi.sh` on macOS/Linux or `scripts/scrcpy-wifi.ps1` on Windows only to mirror an Android device; mirroring is not test automation or evidence by itself
- Use `scripts/scaffold-wdio.sh` when Appium MCP is unavailable but a deterministic WebdriverIO/Appium project is required
- Use `scripts/scaffold-mobile-ci.sh` to install the Android PR-emulator workflow and execution-target hard gate into a target GitHub repository
- Use `scripts/configure-appium-mcp.py --agent antigravity` to configure Appium MCP for Antigravity with an atomic JSON update and backup
- Use a licensed device-cloud integration only when the requested matrix requires devices unavailable locally
- Use native accessibility inspection and a real screen reader for accessibility verdicts
- Use Proxyman MCP for interactive macOS traffic inspection when its official MCP server is available; otherwise use its bundled CLI for session control and HAR export
- Use `mitmdump` as the primary open-source headless or CI network-capture engine
- Use Fiddler Everywhere MCP when its licensed MCP server is configured
- Use Charles headless/CLI or HTTP Toolkit UI/ADB interception only as explicit fallbacks

Read [references/APPIUM_MCP.md](references/APPIUM_MCP.md) before an Appium MCP run. Read [references/MOBILE_CI.md](references/MOBILE_CI.md) before adding or diagnosing mobile CI/CD. Read [references/MOBILE_NETWORK_INSPECTION.md](references/MOBILE_NETWORK_INSPECTION.md) before intercepting or modifying traffic, and use [references/PROXY_TOOL_MATRIX.md](references/PROXY_TOOL_MATRIX.md) to select an engine. Read [references/SCRCPY_WIFI.md](references/SCRCPY_WIFI.md) for Android Wi-Fi mirroring. On Windows, also read [references/WINDOWS_MOBILE_QA.md](references/WINDOWS_MOBILE_QA.md) before setup or execution. Read [references/TROUBLESHOOTING.md](references/TROUBLESHOOTING.md) only when setup or execution fails.

## Workflow

### 1. Establish readiness

Run the platform doctor:

- macOS/Linux: `scripts/mobile-doctor.sh --android`, `--ios`, or `--all`
- Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/mobile-doctor.ps1 -Mode android`

Treat its MCP result as advisory because only the active MCP client can prove tool availability. Local iOS execution requires macOS and Xcode; route iOS requested from Windows to a macOS self-hosted runner or a licensed remote device farm.

For a local Appium MCP run:

1. Confirm the Appium MCP tools are loaded
2. Call `select_device` before creating a local session
3. Prepare an iOS simulator with `prepare_ios_simulator`, or prepare a real iOS device with `appium_prepare_ios_real_device`, when required
4. Create the session with `appium_session_management` and explicit capabilities
5. Record the returned `sessionId`, ownership, platform, OS, device class, and app build

If the tool surface is missing, classify the failing layer as `mcp_not_configured`, `auth_required`, `runtime_missing`, `mcp_not_loaded`, or `permission_denied`. Do not describe every failure as an Appium bug.

### 2. Prove install and launch health

Verify clean install, upgrade when in scope, first launch, permissions, authentication, foreground and background behavior, process restart, device restart when applicable, and uninstall cleanup.

Capture an initial screenshot and the device/app metadata before manipulating the flow.

### 3. Execute and verify each journey

For every action:

1. Locate by `accessibility id`
2. Fall back to `id`
3. Fall back to `-ios predicate string`, `-ios class chain`, or `-android uiautomator`
4. Inspect page source or generated locators if needed
5. Use `appium_gesture` with `action=scroll_to_element` before declaring an off-screen element missing
6. Use scoped XPath only when no stable locator exists
7. Use coordinates or opt-in AI vision only as a documented last resort
8. Perform the action, then assert the resulting state; a successful tap is not a passed test

Cover the requested happy path and relevant validation, persistence, interruption, deep link, notification, camera or picker, clipboard, biometric, network, locale, timezone, rotation, keyboard, gesture, permission, and lifecycle behavior.

### 4. Inspect mobile network behavior

Run `scripts/network-proxy-doctor.sh` on macOS/Linux or `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/network-proxy-doctor.ps1` on Windows, then resolve one explicit engine before capture. Capture passively by default while Appium executes the business journey.

Correlate each network flow with the triggering UI step and verify:

- Method, host, path, status, content type, latency, size, caching, retry, and cancellation behavior
- Authentication and refresh flow without exposing secrets
- GraphQL operation name, error envelope, and partial-data behavior
- WebSocket handshake, reconnect, ordering, duplication, and disconnect recovery
- Offline, timeout, throttled, malformed, and server-error behavior only when those mutations are authorized

Export a sanitized HAR when the selected engine supports it, then run:

```text
python scripts/analyze-mobile-har.py /absolute/path/to/capture.har --format markdown
```

If HTTPS cannot be decrypted, distinguish missing CA trust, certificate pinning, mTLS, proxy bypass, VPN conflict, and unsupported protocol behavior. Do not silently weaken the app.

### 5. Capture evidence

- Capture screenshots at checkpoints and at every failure
- Use screen recording for timing-sensitive, gesture-heavy, crash, or interruption scenarios
- Capture logcat, iOS device logs, or crash reports for crash and ANR findings
- Keep `appium_screenshot.returnRawBase64` false so evidence is saved to a file
- Record the build, device class, OS, real or virtual status, capability set, locator strategy, and reproducibility with each finding
- Store only sanitized network summaries or HAR files; record proxy engine/version, capture scope, CA state, applied rules, and cleanup status

Use [assets/bug-report-template.md](assets/bug-report-template.md) for each confirmed bug. A scanner or exploratory suspicion remains a candidate until reproduction and a control comparison confirm it.

### 6. Stabilize or generate automation

Generate test code only when requested. Prefer Page Object Model boundaries and stable selectors. Keep selectors out of specs. Preserve the exact verified assertions and capability assumptions from the interactive run.

For CI or device farms, use an explicit trusted `remoteServerUrl` and explicit capabilities instead of local device discovery. Pass `sessionId` on every tool call when multiple sessions exist.

Keep agent authoring separate from deterministic CI execution:

- Use Appium MCP against a local or allocated device to inspect the hierarchy, resolve stable locators, verify the journey, and generate requested Page Object Model code
- Commit the Page Objects, selectors, specs, configuration, lockfile, and build adapter
- Run the committed suite in CI with an explicit `EXECUTION_TARGET`; do not run `select_device` in CI
- Use a hosted Android emulator for PR smoke, and use a dedicated self-hosted lab device or remote device farm for real-device coverage
- Run `scripts/check-device-target.sh` before the test runner so missing, offline, mismatched, or unbooted devices fail the job instead of producing skipped green tests

### 7. Clean up and report

Stop recordings and proxy capture; disable temporary proxy, VPN, Rewrite, Breakpoint, Map, scripting, throttling, and replay rules; remove temporary CA trust where required; restore changed orientation, locale, permissions, network, clipboard, notifications, and app state; then delete owned Appium sessions. Do not delete attached remote sessions unless explicitly authorized.

Report:

- Scope and execution contract
- Build checksum and version
- Executed device matrix
- Scenario verdicts and evidence paths
- Confirmed findings and blocked checks
- Sanitized network summary, engine/version, capture scope, and mutation ledger
- Unsupported or unexecuted combinations
- Cleanup status

## Fallback WebdriverIO

Run:

```bash
mobile-qa/scripts/scaffold-wdio.sh /absolute/path/to/mobile-qa-wdio
```

Then edit the generated capability values, install dependencies, and run the smoke spec. Use this fallback only when MCP interaction is unavailable or when the user explicitly asks for maintainable CI code.

For GitHub Actions Android PR smoke, run:

```bash
mobile-qa/scripts/scaffold-mobile-ci.sh /absolute/path/to/target-repository
```

Then implement the target repository contracts documented in [references/MOBILE_CI.md](references/MOBILE_CI.md): `scripts/build-android-test-app.sh`, `ANDROID_APP_PATH`, and `npm run test:mobile:smoke`.

## Completion checks

- Build checksum and installed version are captured
- Executed device matrix and lifecycle scope are explicit
- Every action has a state assertion
- Missing elements were scrolled or inspected before being reported
- Pass/fail results have screenshot or video evidence
- Network and permission recovery were checked when relevant
- Network capture is scoped, sanitized, correlated with UI steps, and cleaned up
- Active proxy rules were explicitly authorized and read back
- Certificate-pinning or mTLS blocks remain visible instead of being bypassed silently
- Real-device claims have real-device evidence
- Crash or ANR findings include platform logs
- Generated code keeps stable selectors outside specs
- CI resolves one explicit execution target before the test runner starts
- PR smoke does not depend on a developer workstation or personal phone
- Created state and owned sessions are cleaned up
- Unsupported combinations remain visible
