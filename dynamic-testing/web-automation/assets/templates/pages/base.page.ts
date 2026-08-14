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
  private readonly selectedOptionValues = new Map<string, string>();

  constructor(protected readonly page: Page) {}

  protected waitTimeout(envName = 'UI_WAIT_TIMEOUT_MS', fallback = 120_000): number {
    const configured = Number.parseInt(process.env[envName] ?? String(fallback), 10);
    return Number.isInteger(configured) && configured >= 1_000 && configured <= 600_000
      ? configured
      : fallback;
  }

  protected waitPollInterval(): number {
    const configured = Number.parseInt(process.env.UI_WAIT_POLL_MS ?? '250', 10);
    return Number.isInteger(configured) && configured >= 50 && configured <= 5_000
      ? configured
      : 250;
  }

  /** Chờ page "sẵn sàng" mà không phụ thuộc networkidle/websocket. */
  async waitForLoad(timeout = this.waitTimeout()): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded', { timeout });
    await this.page.waitForFunction(
      () => document.readyState === 'complete',
      undefined,
      { timeout, polling: this.waitPollInterval() },
    );
  }

  /** Chờ route và application shell sau một navigation. */
  async waitForUrl(urlPattern: RegExp, timeout = this.waitTimeout()): Promise<void> {
    if (!urlPattern.test(this.page.url())) {
      await this.page.waitForURL(urlPattern, { timeout, waitUntil: 'domcontentloaded' });
    }
    await this.waitForLoad(timeout);
  }

  /** Chờ locator hiện và sẵn sàng thao tác. */
  async waitForEnabled(locator: Locator, timeout = this.waitTimeout()): Promise<void> {
    await locator.waitFor({ state: 'visible', timeout });
    const deadline = Date.now() + timeout;
    while (!(await locator.isEnabled())) {
      if (Date.now() >= deadline) throw new Error(`UNTEST: locator remained disabled after ${timeout}ms`);
      await this.page.waitForTimeout(this.waitPollInterval());
    }
  }

  /** Chờ các indicator tải dữ liệu biến mất sau mutation. */
  async waitForUiIdle(timeout = this.waitTimeout()): Promise<void> {
    await this.waitForLoad(timeout);
    await this.page.waitForFunction(
      () => !document.querySelector('[aria-busy="true"], [data-loading="true"], [role="progressbar"]'),
      undefined,
      { timeout, polling: this.waitPollInterval() },
    );
  }

  /** Resolve a human-visible option label against the current live DOM value. */
  protected async selectOptionByLabel(locator: Locator, value: unknown): Promise<void> {
    const requested = this.expectedValue(value).trim();
    const optionValue = await locator.locator('option').evaluateAll((options, label) => {
      const requestedLabel = String(label ?? '').trim();
      const exactLabel = options.find(option => (option.textContent ?? '').trim() === requestedLabel);
      if (exactLabel) return (exactLabel as HTMLOptionElement).value;
      const exactValue = options.find(option => (option as HTMLOptionElement).value === requestedLabel);
      return exactValue ? (exactValue as HTMLOptionElement).value : null;
    }, requested);
    if (optionValue === null) {
      throw new Error(`UNTEST: option "${requested}" was not observed in the current DOM`);
    }
    this.selectedOptionValues.set(requested, optionValue);
    await locator.selectOption(optionValue);
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

  /** Record same-session evidence for a dynamic, data-bound locator. */
  protected async captureDynamicSelectorEvidence(
    targetKey: string,
    locator: Locator,
    operation: string,
    locatorText: string,
    options: {
      strategy?: string;
      state?: string;
      targetName?: string;
      actionable?: boolean;
    } = {},
  ): Promise<void> {
    if (process.env.QA_SELECTOR_EVIDENCE_CAPTURE !== 'true') return;
    const runtime = pomRuntimeFor(this.page);
    if (!runtime) return;
    const count = await locator.count().catch(() => 0);
    const target = count === 1 ? locator : locator.nth(0);
    const visible = count > 0 && await target.isVisible().catch(() => false);
    const actionableExpected = options.actionable ?? [
      'click', 'fill', 'check', 'selectOption', 'setInputFiles',
    ].includes(operation);
    const actionable = actionableExpected
      ? visible && await target.isEnabled().catch(() => false)
      : false;
    let route = this.page.url();
    try { route = new URL(route).pathname; } catch { /* retain raw URL */ }
    runtime.recordSelectorEvidence({
      target_key: targetKey,
      target_names: options.targetName ? [options.targetName] : [],
      status: count === 1 && visible && (!actionableExpected || actionable)
        ? 'runtime_verified'
        : 'unverified',
      strategy: options.strategy ?? 'css',
      locator: locatorText,
      state: options.state ?? `${operation}:${route}`,
      route,
      captured_at: new Date().toISOString(),
      verification: { count, visible, actionable, url: this.page.url() },
    });
  }

  /** Resolve manifest data through the testcase-bound account/dataset slot. */
  expectedValue(value: unknown, targetKey?: string): string {
    const runtime = pomRuntimeFor(this.page);
    const mapSelectedOption = (resolved: string): string => (
      this.selectedOptionValues.get(resolved) ?? resolved
    );
    if (runtime) return mapSelectedOption(runtime.resolveValue(value, targetKey));
    if (value && typeof value === 'object' && 'data_ref' in value) {
      throw new Error('UNTEST: data_ref requires the generated spec to import test from fixtures/pom');
    }
    if (value && typeof value === 'object' && 'value' in value) {
      return mapSelectedOption(String((value as { value: unknown }).value ?? ''));
    }
    return mapSelectedOption(String(value ?? ''));
  }

  /** Resolve and isolate an upload file for this exact test attempt. */
  protected filePath(value: unknown, targetKey?: string): string {
    const runtime = pomRuntimeFor(this.page);
    if (runtime) return runtime.resolveFile(value, targetKey);
    const rendered = this.expectedValue(value, targetKey);
    return path.isAbsolute(rendered) ? rendered : path.resolve(process.cwd(), 'testdata', rendered);
  }
}
