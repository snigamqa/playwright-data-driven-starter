import { test as base } from '@playwright/test';
import { RecoveryAudit } from '../src/locators/recovery.js';
import { InventoryPage } from '../src/pages/inventory-page.js';
import { LoginPage } from '../src/pages/login-page.js';

interface Fixtures {
  recoveryAudit: RecoveryAudit;
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
}

export const test = base.extend<Fixtures>({
  recoveryAudit: async ({}, use, testInfo) => {
    const audit = new RecoveryAudit();
    await use(audit);
    if (audit.hasRecoveries) {
      testInfo.annotations.push({ type: 'locator-recovery', description: audit.summary() });
      await testInfo.attach('locator-recovery.json', {
        body: JSON.stringify(audit.events, null, 2),
        contentType: 'application/json',
      });
      console.warn(`[locator-recovery] ${testInfo.title}\n${audit.summary()}`);
    }
  },
  loginPage: async ({ page, recoveryAudit }, use) => {
    await use(new LoginPage(page, recoveryAudit));
  },
  inventoryPage: async ({ page, recoveryAudit }, use) => {
    await use(new InventoryPage(page, recoveryAudit));
  },
});

export { expect } from '@playwright/test';
