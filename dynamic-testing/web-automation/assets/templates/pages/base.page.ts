import { Page, Locator } from '@playwright/test';

/**
 * BasePage — shared helpers cho mọi Page Object (POM).
 * Các page kế thừa:  class LoginPage extends BasePage { ... }
 *
 * Nguyên tắc POM:
 *  - Locator lấy từ selectors/ (centralized) hoặc định nghĩa inline getByRole.
 *  - Method hành động KHÔNG chứa expect() — assertion nằm ở spec file.
 */
export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /** Chờ page "sẵn sàng". Override per-page nếu có skeleton/loader riêng. */
  async waitForLoad(): Promise<void> {
    // networkidle có thể kẹt ở app có websocket/polling → override nếu cần.
    await this.page.waitForLoadState('networkidle');
  }

  /** Navigate tới path (relative theo baseURL trong config) rồi chờ load. */
  async goto(path: string): Promise<void> {
    await this.page.goto(path);
    await this.waitForLoad();
  }

  /** Chờ 1 network response khớp urlPattern — verify backend call thật sự xảy ra. */
  async waitForResponse(urlPattern: RegExp | string, timeout = 30000) {
    return this.page.waitForResponse(
      (r) => {
        const url = r.url();
        return typeof urlPattern === 'string' ? url.includes(urlPattern) : urlPattern.test(url);
      },
      { timeout },
    );
  }

  /** Trích text gọn (trim) — dùng cho assertion trong spec. */
  async textOf(locator: Locator): Promise<string> {
    return (await locator.innerText()).trim();
  }
}
