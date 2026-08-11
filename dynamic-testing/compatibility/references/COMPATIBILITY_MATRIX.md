# Compatibility and localization matrix

Cover the dimensions that can change user-visible behavior.

## Release-grade matrix version 2

Use exact browser profiles and executable cases. `engine` is the automation
baseline; `vendor` and `version` identify what can be claimed in the report

```json
{
  "matrix_version": 2,
  "project": "SJK",
  "target": "login",
  "browsers": ["chromium", "firefox", "webkit"],
  "required_browser_vendors": ["Chrome", "Safari", "Firefox", "Edge"],
  "browser_profiles": [
    {"id": "chrome-win", "vendor": "Chrome", "version": "stable", "engine": "chromium", "os": "Windows 11"},
    {"id": "edge-win", "vendor": "Edge", "version": "stable", "engine": "chromium", "os": "Windows 11"},
    {"id": "firefox-win", "vendor": "Firefox", "version": "latest", "engine": "firefox", "os": "Windows 11"},
    {"id": "safari-mac", "vendor": "Safari", "version": "latest", "engine": "webkit", "os": "macOS"}
  ],
  "os_versions": ["Windows 11", "macOS"],
  "devices": ["desktop", "tablet", "mobile"],
  "required_devices": ["desktop", "tablet", "mobile"],
  "viewports": [
    {"id": "desktop-1440", "device": "desktop", "width": 1440, "height": 900, "orientation": "landscape"},
    {"id": "tablet-768", "device": "tablet", "width": 768, "height": 1024, "orientation": "portrait"},
    {"id": "mobile-390", "device": "mobile", "width": 390, "height": 844, "orientation": "portrait"}
  ],
  "locales": ["en-US", "vi-VN"],
  "timezones": ["UTC", "Asia/Ho_Chi_Minh"],
  "cases": [
    {"id": "chrome-desktop", "browser_profile": "chrome-win", "os": "Windows 11", "device": "desktop", "viewport": "desktop-1440", "locale": "en-US", "timezone": "UTC", "expected": ["no clipping"]},
    {"id": "edge-tablet", "browser_profile": "edge-win", "os": "Windows 11", "device": "tablet", "viewport": "tablet-768", "locale": "vi-VN", "timezone": "Asia/Ho_Chi_Minh", "expected": ["localized validation"]},
    {"id": "firefox-mobile", "browser_profile": "firefox-win", "os": "Windows 11", "device": "mobile", "viewport": "mobile-390", "locale": "en-US", "timezone": "UTC", "expected": ["no overflow"]},
    {"id": "safari-desktop", "browser_profile": "safari-mac", "os": "macOS", "device": "desktop", "viewport": "desktop-1440", "locale": "vi-VN", "timezone": "Asia/Ho_Chi_Minh", "expected": ["localized validation"]}
  ]
}
```

| Dimension | Examples |
|---|---|
| Engine/vendor/version | Chromium, Firefox, WebKit plus named Chrome, Safari, Firefox and Edge profiles |
| Operating system | exact supported Windows, macOS, Android and iOS versions |
| Form factor | desktop, tablet, mobile |
| Viewport | width, height, orientation and device pixel ratio when relevant |
| Locale | en-US, vi-VN, supported RTL locale |
| Region settings | timezone, currency, decimal/date format |
| Content | long text, Unicode, translated validation and empty states |
| Evidence | screenshot or video per executed case, plus run ID |

A listed dimension without a case is a planning gap, not coverage
