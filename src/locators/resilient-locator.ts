import type { Locator, Page } from '@playwright/test';
import { settings } from '../config/env.js';
import { resolveCandidate, type RecoveryAudit } from './recovery.js';

export interface LocatorSpec {
  description: string;
  build: (page: Page) => Locator;
}

/**
 * Resolves an element from an ordered list of locator specs. The first spec is the primary;
 * later specs are fallbacks whose use is recorded in the audit.
 */
export class ResilientLocator {
  constructor(
    private readonly page: Page,
    private readonly audit: RecoveryAudit,
  ) {}

  async find(element: string, specs: LocatorSpec[]): Promise<Locator> {
    const candidates = specs.map((spec) => {
      const locator = spec.build(this.page).first();
      return {
        description: spec.description,
        value: locator,
        probe: () =>
          locator
            .waitFor({ state: 'visible', timeout: settings.candidateTimeoutMs })
            .then(() => true)
            .catch(() => false),
      };
    });

    return resolveCandidate(element, candidates, this.audit, {
      recoveryEnabled: settings.recoveryEnabled,
    });
  }
}
