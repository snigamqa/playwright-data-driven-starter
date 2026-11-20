import { loadCsvCases } from '../../src/data/load-data.js';
import { expect, test } from '../fixtures.js';

const cases = loadCsvCases('sort-cases.csv');

test.describe('Sort', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.open();
    await loginPage.login('standard_user', 'secret_sauce');
  });

  for (const data of cases) {
    test(`${data.id}: sorted by "${data.option}" lists "${data.expectedFirstProduct}" first`, async ({ inventoryPage }) => {
      await inventoryPage.sortBy(data.option ?? '');

      await expect(await inventoryPage.firstItemName()).toHaveText(data.expectedFirstProduct ?? '');
    });
  }
});
