---
name: mobile-qa
description: Plan and execute Android and iOS QA across apps, simulators, emulators, and real devices with Appium, platform-native tooling, device matrices, gestures, permissions, interruptions, accessibility, networking, lifecycle, and evidence. Use when Codex receives an APK, AAB, IPA, mobile build, Appium request, Android/iOS bug, or real-device regression scope.
---

# Mobile QA

Test behavior across platform, OS, device class, lifecycle, and network state. An emulator-only pass is not a real-device pass.

## Hard gates

1. Resolve build artifact, application ID or bundle ID, environment, supported platforms, OS range, device scope, accounts, test data, and distribution authorization
2. Verify artifact checksum and build version before execution
3. Keep signing files, provisioning profiles, credentials, tokens, and device identifiers out of reports
4. Define cleanup for accounts, notifications, files, permissions, and app state
5. Separate emulator or simulator results from real-device results
6. Do not claim platform coverage outside the executed device matrix
7. Ask approval before purchases, messages, calls, external notifications, account deletion, or other material side effects

Read [references/DEVICE_MATRIX.md](references/DEVICE_MATRIX.md) when selecting coverage. Start Appium configuration from [assets/capabilities.example.json](assets/capabilities.example.json).

## Tool routing

- Use Appium MCP for interactive discovery, session management, locator learning, gestures, screenshots, and test generation
- Convert stable flows to deterministic Appium scripts for regression and CI
- Use Android Studio, adb, logcat, and UiAutomator2 for Android diagnosis
- Use Xcode, simctl, device logs, and XCUITest for iOS diagnosis
- Use BrowserStack MCP only when licensed real-device or broad cross-device coverage is needed
- Use native accessibility inspection and a real screen reader for accessibility verdicts

## Workflow

### 1. Build the matrix

Select representative minimum and current OS versions, small and large screens, phone and tablet where supported, low and high resource classes, orientation, locale, theme, and at least one real device for release-critical flows.

### 2. Establish install and launch health

Verify clean install, upgrade where required, first launch, permissions, login, foreground and background behavior, process restart, device restart when applicable, and uninstall cleanup.

### 3. Execute business journeys

Test happy path, validation, persistence, interruption, deep links, notifications, camera or file picker, clipboard, biometrics, offline and degraded network, timezone, locale, rotation, keyboard, gestures, and app lifecycle according to scope.

### 4. Validate platform quality

Check crash and ANR, memory pressure symptoms, battery or network abuse, layout cutoffs, safe areas, system font scaling, dark mode, accessibility names and focus, platform back behavior, and permission recovery.

### 5. Stabilize automation

Prefer accessibility ID, resource ID, or stable platform identifier. Avoid coordinate-only actions and brittle XPath. Reset only the state owned by the run and record device capability plus build version with every result.

### 6. Report

Each finding includes platform, OS, device model, real or virtual status, app build, preconditions, actions, actual, expected, logs, screenshot or recording, reproducibility, severity, and cleanup status.

## Completion checks

- Build checksum and version are captured
- Executed device matrix is explicit
- Install, upgrade if applicable, lifecycle, and interruption have verdicts
- Network and permission recovery were checked
- Real-device claims have real-device evidence
- Crash or ANR evidence includes platform logs
- Created state is cleaned up
- Unsupported combinations remain visible
