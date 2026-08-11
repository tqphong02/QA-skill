import { appPage } from '../../pageobjects/app.page.mjs'

describe('mobile smoke @mobile @smoke', () => {
  it('launches the selected build', async () => {
    await appPage.waitForLaunch()
    await browser.saveScreenshot('./artifacts/launch.png')
  })
})
