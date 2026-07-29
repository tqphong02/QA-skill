# Mobile CI execution

Use deterministic test code in CI. Appium MCP is the interactive authoring and diagnosis surface; it is not a substitute for allocating a device to the CI job.

## Contents

- [Architecture](#architecture)
- [Execution targets](#execution-targets)
- [Repository contract](#repository-contract)
- [Install the GitHub Actions template](#install-the-github-actions-template)
- [PR Android emulator flow](#pr-android-emulator-flow)
- [Real-device flow](#real-device-flow)
- [Remote device farm](#remote-device-farm)
- [Hard-gate behavior](#hard-gate-behavior)
- [Secrets and pull requests](#secrets-and-pull-requests)
- [Evidence and cleanup](#evidence-and-cleanup)

## Architecture

Separate authoring from execution:

```text
Developer or QA device
  Appium MCP
    inspect hierarchy
    resolve accessibility ID / resource ID / native locator
    verify actions and assertions
    generate or update POM code
             |
             v
Git repository
  selectors + Page Objects + specs + config + lockfile
             |
             v
CI runner
  allocate explicit emulator/device/farm session
  hard gate execution target
  run deterministic Appium/WebdriverIO suite
  upload evidence
```

Do not call `select_device` in CI. Local discovery is appropriate for an interactive MCP session; CI must receive a deterministic allocation from the workflow, self-hosted runner, or remote provider.

## Execution targets

| Target | Device source | Recommended use |
|---|---|---|
| `ci-emulator` | Android emulator booted inside the job | Pull-request smoke |
| `ci-simulator` | Xcode Simulator on a macOS runner | iOS smoke |
| `self-hosted-device` | Dedicated lab runner with an attached device | Nightly/release real-device checks |
| `remote-device-farm` | Provider-allocated device/session | Matrix and real-device coverage |
| `local-emulator` | Developer emulator | Local deterministic suite |
| `local-device` | Developer test device with exact UDID | Local deterministic suite only |

A personal phone cannot appear on a GitHub-hosted runner. It can be used only when the developer machine is deliberately registered as a self-hosted runner, remains online, has the phone connected, and is isolated from untrusted pull requests. Prefer a dedicated lab runner and test device.

## Repository contract

The target repository must provide:

```text
package.json
package-lock.json
wdio.conf.ci.mjs
scripts/build-android-test-app.sh
test/specs or equivalent POM suite
```

Required package script:

```json
{
  "scripts": {
    "test:mobile:smoke": "wdio run ./wdio.conf.ci.mjs --suite smoke"
  }
}
```

Required build adapter:

```text
scripts/build-android-test-app.sh <absolute-output-apk>
```

The adapter must build or copy the authorized debug/staging APK to the exact output path supplied by the workflow. Implement it for the repository's actual stack:

- Native Android: Gradle assemble task, then copy the resulting APK
- Flutter: `flutter build apk`, then copy the resulting APK
- React Native: repository-specific Gradle task
- Prebuilt artifact: authenticated download with checksum verification

Do not leave a generic build command or APK path silently unresolved. The workflow fails before emulator startup when the contract is missing.

The CI WebdriverIO capabilities must read:

```text
ANDROID_UDID
ANDROID_APP_PATH
```

Do not hardcode a developer device serial, workstation path, account token, or signing secret.

## Install the GitHub Actions template

From this skill:

```bash
scripts/scaffold-mobile-ci.sh /absolute/path/to/target-repository
```

It creates:

```text
.github/workflows/pr-android-smoke.yml
scripts/check-device-target.sh
```

The scaffold refuses to overwrite existing files. Review the workflow, implement the repository contract, make the hard gate executable, and validate the YAML before commit.

## PR Android emulator flow

The bundled workflow:

1. Checks out the pull request
2. Installs Node and Java
3. Runs `npm ci`
4. Builds the APK through the repository adapter
5. Installs the Appium UiAutomator2 driver
6. Enables KVM permissions
7. Boots one explicit Android emulator
8. Runs `scripts/check-device-target.sh`
9. Runs `npm run test:mobile:smoke`
10. Uploads screenshots, reports, Appium logs, and other evidence even on failure

Use a small smoke suite on PRs. Run broader regression on schedule, release candidates, or after merge.

## Real-device flow

For a dedicated self-hosted Android lab runner:

- Register a runner with labels such as `self-hosted`, `mobile-lab`, `android`
- Attach one controlled test device or implement a device reservation service
- Keep ADB authorization, SDK, Node, Java, Appium, and the UiAutomator2 driver pre-provisioned
- Set `EXECUTION_TARGET=self-hosted-device`
- Set `DEVICE_LABEL` to the non-sensitive lab label
- Set `ANDROID_UDID` through runner-local configuration, not repository content
- Run the same hard gate before tests
- Reset app data, sessions, proxy state, and device state after every job

Do not run forked or untrusted pull-request code on a self-hosted runner with physical devices or internal network access.

## Remote device farm

Use `EXECUTION_TARGET=remote-device-farm` and provide:

```text
APPIUM_REMOTE_SERVER_URL
REMOTE_DEVICE_CAPABILITIES_JSON
```

Store provider usernames, access keys, and tokens in repository or organization secrets. Resolve the provider capabilities and concurrency limits explicitly. The hard gate validates the contract but cannot prove provider allocation until the Appium session is created.

Use one provider-specific config module rather than embedding secrets or arbitrary JSON directly in specs.

## Hard-gate behavior

`scripts/check-device-target.sh` rejects:

- Missing or unknown `EXECUTION_TARGET`
- `ci-emulator` outside CI
- Missing or non-emulator `ANDROID_UDID` for `ci-emulator`
- Missing, unauthorized, offline, or mismatched ADB target
- Android emulator whose boot property is not complete
- Missing or unbooted iOS Simulator UDID
- A self-hosted target without a lab label and exact device
- A remote farm without URL and capabilities
- `local-device` or `local-emulator` when `CI=true`

The gate exits non-zero before WebdriverIO starts. A skipped suite cannot turn missing infrastructure into a green job.

## Secrets and pull requests

- Use least-privilege repository or organization secrets
- Do not expose secrets to workflows from forks
- Pin third-party actions to a reviewed version or commit according to repository policy
- Keep remote URLs and capability values from untrusted pull-request content
- Use staging accounts and disposable data
- Redact real-device serials, tokens, headers, and user data from logs and artifacts

## Evidence and cleanup

Upload evidence with `if: always()` and a bounded retention period:

- Screenshots and recordings
- Test and Allure reports
- Appium and device logs
- Build checksum and version
- Executed target, platform, OS, and virtual/real classification

Always delete owned sessions. Restore app data, permissions, orientation, locale, proxy, CA, VPN, and network rules changed by the run. Preserve a failed emulator only through logs and artifacts; do not leave a hosted job waiting indefinitely.
