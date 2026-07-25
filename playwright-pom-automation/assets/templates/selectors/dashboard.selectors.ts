import type { Page } from '@playwright/test';

/**
 * Centralized selectors cho Dashboard — SINGLE SOURCE OF TRUTH cho mọi locator.
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
export const dashboardSelectors = {
  // data-testid (ưu tiên — thống nhất với frontend team)
  headerTitleTestId: '[data-testid="dashboard-header-title"]',
  tableRowTestId: '[data-testid="dashboard-table-row"]',
  paginationNextTestId: '[data-testid="dashboard-pagination-next"]',
  filterInputTestId: '[data-testid="dashboard-filter-input"]',

  // xpath — dùng cho cấu trúc table phức tạp
  tableRowXpath: '//table[contains(@class,"data-table")]//tbody/tr',
} as const;

// ─────────────────────────────────────────────────────────────
// LOCATOR factory — build Playwright Locator từ page.
// Ưu tiên getByRole/getByLabel/getByTestId; fallback page.locator(raw string).
// ─────────────────────────────────────────────────────────────
export const buildDashboardLocators = (page: Page) => ({
  // Ưu tiên (role) — resilient nhất
  headerTitle: page.getByRole('heading', { name: /dashboard|bảng điều khiển/i }),
  nextPageButton: page.getByRole('button', { name: /next|trang sau|›/i }),
  filterInput: page.getByRole('searchbox', { name: /filter|tìm kiếm/i }),

  // Data-testid (nếu frontend có set — ưu tiên hơn xpath)
  headerTitleByTestId: page.getByTestId('dashboard-header-title'),
  rowByTestId: page.locator(dashboardSelectors.tableRowTestId),
  nextPageByTestId: page.getByTestId('dashboard-pagination-next'),

  // Fallback (xpath cho table rows — khi test-id chưa có sẵn)
  rowByXpath: page.locator(dashboardSelectors.tableRowXpath),
});

export type DashboardLocators = ReturnType<typeof buildDashboardLocators>;
