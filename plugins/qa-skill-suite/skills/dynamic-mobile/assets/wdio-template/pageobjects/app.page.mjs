import { appSelectors } from '../selectors/app.selectors.mjs'

class AppPage {
  primaryAction() {
    const selector = driver.isIOS
      ? appSelectors.primaryAction.ios
      : appSelectors.primaryAction.android
    return $(selector)
  }

  async waitForLaunch() {
    await browser.waitUntil(
      async () => (await browser.getPageSource()).length > 0,
      { timeout: 30000, timeoutMsg: 'App page source did not become available' }
    )
  }
}

export const appPage = new AppPage()
