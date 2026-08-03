import type { Page } from '@playwright/test';

/**
 * Centralized selectors cho Login — SINGLE SOURCE OF TRUTH cho mọi locator.
 * Khi UI đổi → sửa Ở ĐÂY; page object + spec import từ đây, tự cập nhật.
 *
 * Strategy ưu tiên (top → bottom):
 *   1. existing FE-owned data-testid (chỉ dùng sau khi source/live DOM verify)
 *   2. stable id
 *   3. stable CSS attribute/class (không dùng generated class)
 *   4. role / label / placeholder / text
 *   5. short anchored XPath (last resort, phải có reason + runtime evidence)
 *
 * READONLY PATTERN:
 *   `as const`          → mọi giá trị tự động thành readonly literal string.
 *                         TypeScript ngăn gán đè tại compile time:
 *                         loginSelectors.emailInputId = '...' → ERROR ✗
 *   Tương đương Java:   public static final String EMAIL_ID = "#email";
 *
 * IMPORTANT: These raw values are illustrative placeholders only. Before
 * committing a project selector, map each testcase target.key to the live DOM,
 * verify count=1/visible/actionable, and record selector-evidence/<feature>.json
 */

// ─────────────────────────────────────────────────────────────
// RAW selector strings — IMMUTABLE via `as const`
// ─────────────────────────────────────────────────────────────
export const loginSelectors = {
  // id — candidate thứ hai sau FE-owned data-testid
  emailInputId:    '#email',
  passwordInputId: '#password',
  submitButtonId:  '#login-submit',
  errorMessageId:  '#login-error',

  // xpath — chỉ sau testid/id/CSS/semantic đều unavailable hoặc ambiguous AND runtime evidence proves it
  rememberCheckboxXpath: '//label[contains(.,"Remember")]/input[@type="checkbox"]',
} as const;

// Expose kiểu readonly tường minh để dùng khi cần type annotation
export type LoginSelectorKeys = keyof typeof loginSelectors;

// ─────────────────────────────────────────────────────────────
// LOCATOR factory — build Playwright Locator từ page.
// Candidate order: testid → id → CSS → semantic → XPath.
// Chỉ chọn một candidate đã runtime-verified; không dùng tất cả như fallback mù.
// ─────────────────────────────────────────────────────────────
export const buildLoginLocators = (page: Page) => ({
  // Candidate 1 — chỉ tồn tại nếu FE đã cung cấp test-id này và evidence xác nhận
  emailInputByTestId: page.getByTestId('login-email'),

  // Candidate 2 — stable id
  emailInputById:    page.locator(loginSelectors.emailInputId),
  submitById:        page.locator(loginSelectors.submitButtonId),

  // Candidate 3 — stable CSS attributes/classes (add only after runtime verification)
  emailInputByCss: page.locator('[name="email"]'),

  // Candidate 4 — semantic locators
  emailInput:    page.getByRole('textbox', { name: /email/i }),
  passwordInput: page.getByLabel(/password|mật khẩu/i),
  submitButton:  page.getByRole('button', { name: /sign in|log in|đăng nhập/i }),
  errorMessage:  page.getByRole('alert'),

  // Candidate 5 — XPath last resort
  rememberByXpath: page.locator(loginSelectors.rememberCheckboxXpath),
});

export type LoginLocators = ReturnType<typeof buildLoginLocators>;
