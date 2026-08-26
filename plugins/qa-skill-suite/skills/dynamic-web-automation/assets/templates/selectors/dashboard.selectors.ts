import type { Page } from '@playwright/test';

/**
 * Centralized selectors cho Dashboard — SINGLE SOURCE OF TRUTH cho mọi locator.
 * Khi UI đổi → sửa Ở ĐÂY; page object + spec import từ đây, tự cập nhật.
 *
 * Strategy ưu tiên (top → bottom):
 *   1. existing FE-owned data-testid (chỉ dùng sau khi source/live DOM verify)
 *   2. stable id
 *   3. stable CSS attribute/class (không dùng generated class)
 *   4. role / label / placeholder / text
 *   5. short anchored XPath (last resort, phải có reason + runtime evidence)
 *
 * IMPORTANT: This file is a shape example, not selector evidence. Verify every
 * target against the live DOM and record selector-evidence/dashboard.json
 */

// ─────────────────────────────────────────────────────────────
// RAW selector strings (id / xpath / css) — dùng page.locator(...)
// ─────────────────────────────────────────────────────────────
export const dashboardSelectors = {
  // data-testid candidates — chỉ dùng nếu FE source/contract hoặc live DOM đã có và verify
  headerTitleTestId: '[data-testid="dashboard-header-title"]',
  tableRowTestId: '[data-testid="dashboard-table-row"]',
  paginationNextTestId: '[data-testid="dashboard-pagination-next"]',
  filterInputTestId: '[data-testid="dashboard-filter-input"]',

  // xpath — last resort only; require runtime uniqueness/actionability evidence
  tableRowXpath: '//table[contains(@class,"data-table")]//tbody/tr',
} as const;

// ─────────────────────────────────────────────────────────────
// LOCATOR factory — build Playwright Locator từ page.
// Candidate order: testid → id → CSS → semantic → XPath.
// Chỉ chọn một candidate đã runtime-verified; không dùng fallback mù.
// ─────────────────────────────────────────────────────────────
export const buildDashboardLocators = (page: Page) => ({
  // Candidate 1 — FE-owned test-id nếu tồn tại
  headerTitleByTestId: page.getByTestId('dashboard-header-title'),
  rowByTestId: page.locator(dashboardSelectors.tableRowTestId),
  nextPageByTestId: page.getByTestId('dashboard-pagination-next'),

  // Candidate 2/3 — add stable id/CSS only when found in runtime DOM
  filterInputByCss: page.locator('[name="filter"]'),

  // Candidate 4 — semantic
  headerTitle: page.getByRole('heading', { name: /dashboard|bảng điều khiển/i }),
  nextPageButton: page.getByRole('button', { name: /next|trang sau|›/i }),
  filterInput: page.getByRole('searchbox', { name: /filter|tìm kiếm/i }),

  // Candidate 5 — XPath last resort
  rowByXpath: page.locator(dashboardSelectors.tableRowXpath),
});

export type DashboardLocators = ReturnType<typeof buildDashboardLocators>;
