import { loadCsvCases } from '../../src/data/load-data.js';
import { expect, test } from '../fixtures.js';

const cases = loadCsvCases('products.csv');

test.describe('Cart', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.open();
    await loginPage.login('standard_user', 'secret_sauce');
  });

  for (const data of cases) {
    test(`${data.id}: add "${data.product}" to cart`, async ({ inventoryPage }) => {
      const product = data.product ?? '';
      await expect(await inventoryPage.itemPrice(product)).toHaveText(data.price ?? '');

      await inventoryPage.addToCart(product);

      await expect(await inventoryPage.cartBadge()).toHaveText('1');
    });
  }
});
