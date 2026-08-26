# iOS capabilities

Start from `../assets/capabilities.example.json` and replace runtime values. Never commit UDIDs, signing material, or provisioning profiles.

## Simulator

```json
{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "appium:deviceName": "iPhone Simulator",
  "appium:udid": "RUNTIME_SIMULATOR_UDID",
  "appium:app": "/absolute/path/to/app.app",
  "appium:noReset": false,
  "appium:newCommandTimeout": 120
}
```

Call `prepare_ios_simulator` before session creation when WebDriverAgent or simulator boot preparation is required.

## Real device

1. Require macOS, Xcode 16 or later, Developer Mode, device trust, and an authorized Apple developer account
2. Call `appium_prepare_ios_real_device` without `provisioningProfileUuid` to list eligible profiles
3. Select the exact authorized profile and account type
4. Call the tool again with that profile
5. Pass the returned capability hint into session creation

Do not copy provisioning UUIDs, team IDs, signing certificates, or device UDIDs into reports.

## Selection rules

- Use `.app` for a simulator build and an appropriately signed `.ipa` for a real device
- Keep simulator and real-device verdicts separate
- Test safe areas, system dialogs, backgrounding, privacy permissions, and interruption behavior on the actual requested device class
- Use a real device for release-critical camera, biometric, push-notification, performance, and hardware-dependent flows
