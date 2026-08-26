# Android capabilities

Start from `../assets/capabilities.example.json` and replace runtime values. Never commit a personal device identifier.

## Local emulator or real device

```json
{
  "platformName": "Android",
  "appium:automationName": "UiAutomator2",
  "appium:deviceName": "Android Device",
  "appium:udid": "RUNTIME_ADB_SERIAL",
  "appium:app": "/absolute/path/to/app.apk",
  "appium:noReset": false,
  "appium:newCommandTimeout": 120,
  "appium:autoGrantPermissions": false
}
```

Use `appium:appPackage` and `appium:appActivity` instead of `appium:app` only when testing an already installed authorized build. Keep `appium:noReset=false` for isolation unless the scenario explicitly needs preserved state.

## Selection rules

- Resolve `appium:udid` from `select_device` or `adb devices`; never guess it
- Use the exact APK path and capture its checksum
- Keep permission prompts visible when permission behavior is under test
- Use one session per allocated device
- For an AAB, obtain the installable APK set or install through the authorized distribution path before Appium execution

## Wi-Fi-connected Android

An ADB serial such as `192.0.2.10:5555` can be used as `appium:udid` after `adb devices` reports it as `device`. Follow [SCRCPY_WIFI.md](SCRCPY_WIFI.md) to establish and verify that connection. Scrcpy is optional and does not create an Appium session.
