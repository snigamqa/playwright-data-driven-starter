import type { Locator, Page } from '@playwright/test';
import type { RecoveryAudit } from '../locators/recovery.js';
import { ResilientLocator, type LocatorSpec } from '../locators/resilient-locator.js';

export abstract class BasePage {
  private readonly locators: ResilientLocator;

  constructor(
    protected readonly page: Page,
    audit: RecoveryAudit,
  ) {
    this.locators = new ResilientLocator(page, audit);
  }

  protected find(element: string, specs: LocatorSpec[]): Promise<Locator> {
    return this.locators.find(`${this.constructor.name}.${element}`, specs);
  }
}
