import type { Page } from '@playwright/test';

/**
 * Centralized Dashboard selector examples. This file demonstrates shape only;
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
 * Before promoting any locator, verify count, visibility and actionability in
 * the live DOM and record selector-evidence/dashboard.json
 */
export const dashboardSelectors = {
  headerTitleTestId: '[data-testid="dashboard-header-title"]',
  tableRowTestId: '[data-testid="dashboard-table-row"]',
  paginationNextTestId: '[data-testid="dashboard-pagination-next"]',
  filterInputTestId: '[data-testid="dashboard-filter-input"]',
  tableRowXpath: '//table[contains(@class,"data-table")]//tbody/tr',
} as const;

export const buildDashboardLocators = (page: Page) => ({
  // Candidate 1: semantic identity
  headerTitle: page.getByRole('heading', { name: /dashboard|bảng điều khiển/i }),
  nextPageButton: page.getByRole('button', { name: /next|trang sau|›/i }),
  filterInput: page.getByRole('searchbox', { name: /filter|tìm kiếm/i }),

  // Candidate 2: existing FE-owned test-id only
  headerTitleByTestId: page.getByTestId('dashboard-header-title'),
  rowByTestId: page.locator(dashboardSelectors.tableRowTestId),
  nextPageByTestId: page.getByTestId('dashboard-pagination-next'),

  // Candidates 3/4: stable id or CSS observed in the live DOM
  filterInputByCss: page.locator('[name="filter"]'),

  // Candidate 6: XPath last resort
  rowByXpath: page.locator(dashboardSelectors.tableRowXpath),
});

export type DashboardLocators = ReturnType<typeof buildDashboardLocators>;
