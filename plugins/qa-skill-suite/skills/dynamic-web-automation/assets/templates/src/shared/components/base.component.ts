import type { Locator, Page } from '@playwright/test';

/** Shared UI behavior only. Feature-specific actions stay inside src/modules. */
export abstract class BaseComponent {
  protected constructor(protected readonly page: Page, protected readonly root: Locator) {}

  async waitUntilReady(): Promise<void> {
    await this.root.waitFor({ state: 'visible' });
  }
}
