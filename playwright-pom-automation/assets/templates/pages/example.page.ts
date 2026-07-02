import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { buildLoginLocators, type LoginLocators } from '../selectors';

/**
 * LoginPage — Page Object mẫu.
 * Locator lấy từ centralized selectors/ folder (single source of truth).
 *
 * Quy ước:
 *  - readonly locator property — expose locator cho spec.
 *  - Method chỉ THAO TÁC + TRẢ DATA, KHÔNG expect() ở đây.
 *  - Đổi selector → sửa ở selectors/login.selectors.ts, KHÔNG sửa page này.
 */
export class LoginPage extends BasePage {
  private readonly locs: LoginLocators;

  constructor(page: Page) {
    super(page);
    this.locs = buildLoginLocators(page);
  }

  // Expose locator (readonly-style qua getter)
  get emailInput(): Locator { return this.locs.emailInput; }
  get passwordInput(): Locator { return this.locs.passwordInput; }
  get submitButton(): Locator { return this.locs.submitButton; }
  get errorMessage(): Locator { return this.locs.errorMessage; }

  // --- Actions (KHÔNG expect ở đây) ---

  async open(): Promise<void> {
    await this.goto('/login');
  }

  async fillCredentials(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /** Flow login gộp — tiện dùng trong setup test khác. */
  async login(email: string, password: string): Promise<void> {
    await this.fillCredentials(email, password);
    await this.submit();
  }

  async getError(): Promise<string> {
    return this.textOf(this.errorMessage);
  }
}
