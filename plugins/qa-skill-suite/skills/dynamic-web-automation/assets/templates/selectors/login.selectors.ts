import type { Page } from '@playwright/test';

/**
 * Centralized Login selector examples. This file demonstrates shape only;
 * it is not runtime selector evidence
 *
 * Candidate priority:
 *   1. role / label
 *   2. existing FE-owned data-testid
 *   3. stable id
 *   4. stable CSS attribute/class
 *   5. placeholder / text
 *   6. short anchored XPath with a recorded reason
 *
 * Never invent a test-id. Verify each selected locator against the live DOM and
 * record selector-evidence/<feature>.json before using it in generated POM code
 */
export const loginSelectors = {
  emailInputId: '#email',
  passwordInputId: '#password',
  submitButtonId: '#login-submit',
  errorMessageId: '#login-error',
  rememberCheckboxXpath: '//label[contains(.,"Remember")]/input[@type="checkbox"]',
} as const;

export type LoginSelectorKeys = keyof typeof loginSelectors;

export const buildLoginLocators = (page: Page) => ({
  // Candidate 1: semantic identity
  emailInput: page.getByRole('textbox', { name: /email/i }),
  passwordInput: page.getByLabel(/password|mật khẩu/i),
  submitButton: page.getByRole('button', { name: /sign in|log in|đăng nhập/i }),
  errorMessage: page.getByRole('alert'),

  // Candidate 2: existing FE-owned test-id only
  emailInputByTestId: page.getByTestId('login-email'),

  // Candidate 3: stable id
  emailInputById: page.locator(loginSelectors.emailInputId),
  submitById: page.locator(loginSelectors.submitButtonId),

  // Candidate 4: stable CSS observed in the live DOM
  emailInputByCss: page.locator('[name="email"]'),

  // Candidate 6: XPath last resort
  rememberByXpath: page.locator(loginSelectors.rememberCheckboxXpath),
});

export type LoginLocators = ReturnType<typeof buildLoginLocators>;
