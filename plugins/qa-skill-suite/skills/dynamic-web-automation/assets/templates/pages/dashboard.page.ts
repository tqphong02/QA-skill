import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { buildDashboardLocators, type DashboardLocators } from '../selectors';

/**
 * DashboardPage — Page Object mẫu cho page có table + pagination.
 * Locator lấy từ centralized selectors/ folder (single source of truth).
 *
 * Quy ước:
 *  - readonly locator property — expose locator cho spec.
 *  - Method chỉ THAO TÁC + TRẢ DATA, KHÔNG expect() ở đây.
 *  - Đổi selector → sửa ở selectors/dashboard.selectors.ts, KHÔNG sửa page này.
 *  - Flat page (không Header/UserMenu sub-component) — theo ui-testing.md §1.
 */
export class DashboardPage extends BasePage {
  private readonly locs: DashboardLocators;

  constructor(page: Page) {
    super(page);
    this.locs = buildDashboardLocators(page);
  }

  // Expose locator (readonly-style qua getter)
  get headerTitle(): Locator { return this.locs.headerTitle; }
  get nextPageButton(): Locator { return this.locs.nextPageButton; }
  get filterInput(): Locator { return this.locs.filterInput; }
  get rows(): Locator { return this.locs.rowByTestId; }

  // --- Actions (KHÔNG expect ở đây) ---

  async open(): Promise<void> {
    await this.goto('/dashboard');
  }

  async filterBy(text: string): Promise<void> {
    await this.filterInput.fill(text);
    await this.waitForLoad();
  }

  async goToNextPage(): Promise<void> {
    await this.nextPageButton.click();
    await this.waitForLoad();
  }

  /** Đếm số row hiện tại; template dùng test-id khi selector evidence đã xác nhận nó. */
  async getRowCount(): Promise<number> {
    return this.locs.rowByTestId.count();
  }

  /** Lấy text của header title (spec dùng để verify đúng page). */
  async getHeaderTitle(): Promise<string> {
    return this.textOf(this.headerTitle);
  }
}
