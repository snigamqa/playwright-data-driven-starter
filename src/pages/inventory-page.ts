import type { Locator, Page } from '@playwright/test';
import { BasePage } from './base-page.js';

export class InventoryPage extends BasePage {
  readonly path = /\/inventory\.html$/;

  title(): Promise<Locator> {
    return this.find('title', [
      { description: 'testId=title', build: (p) => p.getByTestId('title') },
      { description: 'css=.title', build: (p) => p.locator('.title') },
    ]);
  }

  itemPrice(productName: string): Promise<Locator> {
    return this.find(`itemPrice(${productName})`, [
      {
        description: 'testId=inventory-item-price in item',
        build: (p) => item(p, productName).getByTestId('inventory-item-price'),
      },
      {
        description: 'css=.inventory_item_price in item',
        build: (p) => item(p, productName).locator('.inventory_item_price'),
      },
    ]);
  }

  async addToCart(productName: string): Promise<void> {
    const button = await this.find(`addToCart(${productName})`, [
      {
        description: 'role=button[name=Add to cart] in item',
        build: (p) => item(p, productName).getByRole('button', { name: 'Add to cart' }),
      },
      {
        description: 'css=button.btn_inventory in item',
        build: (p) => item(p, productName).locator('button.btn_inventory'),
      },
    ]);
    await button.click();
  }

  cartBadge(): Promise<Locator> {
    return this.find('cartBadge', [
      { description: 'testId=shopping-cart-badge', build: (p) => p.getByTestId('shopping-cart-badge') },
      { description: 'css=.shopping_cart_badge', build: (p) => p.locator('.shopping_cart_badge') },
    ]);
  }

  /** Sorts the inventory by the visible option text, e.g. "Price (low to high)". */
  async sortBy(option: string): Promise<void> {
    const dropdown = await this.find('sortDropdown', [
      { description: 'role=combobox', build: (p) => p.getByRole('combobox') },
      { description: 'testId=product-sort-container', build: (p) => p.getByTestId('product-sort-container') },
      { description: 'css=#product_sort_container', build: (p) => p.locator('#product_sort_container') },
    ]);
    await dropdown.selectOption({ label: option });
  }

  /** Locator for the name of the product listed first in the current sort order. */
  firstItemName(): Promise<Locator> {
    return this.find('firstItemName', [
      { description: 'testId=inventory-item-name', build: (p) => p.getByTestId('inventory-item-name') },
      { description: 'css=.inventory_item_name', build: (p) => p.locator('.inventory_item_name') },
    ]);
  }
}

function item(page: Page, productName: string): Locator {
  return page.locator('.inventory_item').filter({ hasText: productName });
}
