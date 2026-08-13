import path from 'node:path';
import { Page, Locator } from '@playwright/test';
import { pomRuntimeFor } from '../fixtures/runtime-context';

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

  /** Resolve manifest data through the testcase-bound account/dataset slot. */
  expectedValue(value: unknown, targetKey?: string): string {
    const runtime = pomRuntimeFor(this.page);
    if (runtime) return runtime.resolveValue(value, targetKey);
    if (value && typeof value === 'object' && 'data_ref' in value) {
      throw new Error('UNTEST: data_ref requires the generated spec to import test from fixtures/pom');
    }
    if (value && typeof value === 'object' && 'value' in value) {
      return String((value as { value: unknown }).value ?? '');
    }
    return String(value ?? '');
  }

  /** Resolve and isolate an upload file for this exact test attempt. */
  protected filePath(value: unknown, targetKey?: string): string {
    const runtime = pomRuntimeFor(this.page);
    if (runtime) return runtime.resolveFile(value, targetKey);
    const rendered = this.expectedValue(value, targetKey);
    return path.isAbsolute(rendered) ? rendered : path.resolve(process.cwd(), 'testdata', rendered);
  }
}
