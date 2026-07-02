import type { Page, Locator } from '@playwright/test';

/**
 * Centralized selectors cho Login — SINGLE SOURCE OF TRUTH cho mọi locator.
 * Khi UI đổi → sửa Ở ĐÂY; page object + spec import từ đây, tự cập nhật.
 *
 * Strategy ưu tiên (top → bottom, càng dưới càng brittle):
 *   1. role / label / testid   → KHUYẾN KHÍCH (resilient nhất)
 *   2. id                      → ổn định nếu frontend set cố định
 *   3. xpath                   → khi cấu trúc phức tạp, dùng ít
 *   4. css class               → tránh (auto-generated, dễ vỡ)
 */

// ─────────────────────────────────────────────────────────────
// RAW selector strings (id / xpath / css) — dùng page.locator(...)
// ─────────────────────────────────────────────────────────────
export const loginSelectors = {
  // id (ưu tiên hơn css class)
  emailInputId: '#email',
  passwordInputId: '#password',
  submitButtonId: '#login-submit',
  errorMessageId: '#login-error',

  // xpath — chỉ khi không có id/role ổn định
  rememberCheckboxXpath: '//label[contains(.,"Remember")]/input[@type="checkbox"]',
} as const;

// ─────────────────────────────────────────────────────────────
// LOCATOR factory — build Playwright Locator từ page.
// Ưu tiên getByRole/getByLabel/getByTestId; fallback page.locator(raw string).
// ─────────────────────────────────────────────────────────────
export const buildLoginLocators = (page: Page) => ({
  // Ưu tiên (role/label) — resilient nhất
  emailInput: page.getByRole('textbox', { name: /email/i }),
  passwordInput: page.getByLabel(/password|mật khẩu/i }),
  submitButton: page.getByRole('button', { name: /sign in|log in|đăng nhập/i }),
  errorMessage: page.getByRole('alert'),

  // Fallback (id / xpath từ raw strings ở trên)
  emailById: page.locator(loginSelectors.emailInputId),
  submitById: page.locator(loginSelectors.submitButtonId),
  rememberByXpath: page.locator(loginSelectors.rememberCheckboxXpath),

  // data-testid (nếu frontend có set)
  emailByTestId: page.getByTestId('login-email'),
});

export type LoginLocators = ReturnType<typeof buildLoginLocators>;
