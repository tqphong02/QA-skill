export const androidCapabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:deviceName': 'Android Device',
  'appium:udid': process.env.ANDROID_UDID,
  'appium:app': process.env.ANDROID_APP_PATH,
  'appium:noReset': false
}

export const iosCapabilities = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:deviceName': 'iPhone Simulator or Device',
  'appium:udid': process.env.IOS_UDID,
  'appium:app': process.env.IOS_APP_PATH,
  'appium:noReset': false
}
