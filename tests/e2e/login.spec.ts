import { loadJsonCases } from '../../src/data/load-data.js';
import { expect, test } from '../fixtures.js';

interface LoginCase {
  id: string;
  description: string;
  username: string;
  password: string;
  expectedError: string | null;
}

const cases = loadJsonCases<LoginCase>('login-cases.json');

test.describe('Login', () => {
  for (const data of cases) {
    test(`${data.id}: ${data.description}`, async ({ page, loginPage, inventoryPage }) => {
      await loginPage.open();
      await loginPage.login(data.username, data.password);

      if (data.expectedError === null) {
        await expect(page).toHaveURL(inventoryPage.path);
        await expect(await inventoryPage.title()).toHaveText('Products');
      } else {
        await expect(await loginPage.errorMessage()).toHaveText(data.expectedError);
      }
    });
  }
});
