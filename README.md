# Playwright data-driven starter

Playwright + TypeScript starter with:

- **Data-driven tests**: one test per row in a JSON or CSV file.
- **Page Object Model (POM)**: each page is a class that owns its locators and actions.
- **Audited locator recovery**: every element has a primary locator plus ordered fallbacks.
  If the primary fails and a fallback works, the test continues and the recovery is reported.
- **Docker** and **GitHub Actions** setups that run the same tests.

The example tests run against the public demo shop <https://www.saucedemo.com>.

## Quick start

Requires Node 20+ (pinned in `.nvmrc`).

```bash
npm run setup     # checks Node (switches with nvm if needed), installs deps and Chromium
npm run verify    # typecheck + unit tests + browser tests
```

| Command               | What it does                                  |
| --------------------- | --------------------------------------------- |
| `npm test`            | Browser tests (headless Chromium)             |
| `npm run test:headed` | Browser tests with a visible browser          |
| `npm run test:unit`   | Unit tests for the framework code (no browser) |
| `npm run typecheck`   | TypeScript check                              |
| `npm run test:docker` | Browser tests inside the Playwright Docker image |
| `npm run report`      | Open the last HTML report                     |

## Project layout

```text
src/
  config/env.ts               environment settings
  data/csv.ts, load-data.ts   JSON/CSV loaders with id validation
  locators/recovery.ts        fallback logic and audit log (browser-independent)
  locators/resilient-locator.ts  Playwright wrapper around the fallback logic
  pages/                      page objects
test-data/                    login-cases.json, products.csv
tests/
  fixtures.ts                 provides page objects and attaches the recovery audit
  e2e/                        browser specs
  unit/                       node:test unit tests
```

## Adding a data-driven test

1. Add a file to `test-data/`. Every case needs a unique `id`; it becomes part of the test title.
2. Load it in a spec with `loadJsonCases<T>('file.json')` or `loadCsvCases('file.csv')`.
3. Loop over the cases and call `test(...)` once per case (see `tests/e2e/login.spec.ts`).

## Locator recovery

Page objects declare locators in priority order:

```ts
return this.find('username', [
  { description: 'testId=username', build: (p) => p.getByTestId('username') },
  { description: 'placeholder=Username', build: (p) => p.getByPlaceholder('Username') },
]);
```

When a fallback is used, the test:

- gets a `locator-recovery` annotation in the HTML report,
- gets a `locator-recovery.json` attachment listing element, failed primary and the locator used,
- prints a `[locator-recovery]` warning to the console.

A recovered test still passes, so review these reports and update the primary locator.
Set `LOCATOR_RECOVERY=off` to use primary locators only (useful to catch stale locators in CI).

## Configuration

| Variable                       | Default                     | Purpose                          |
| ------------------------------ | --------------------------- | -------------------------------- |
| `BASE_URL`                     | `https://www.saucedemo.com` | Site under test                  |
| `LOCATOR_RECOVERY`             | `on`                        | `off` disables fallbacks         |
| `LOCATOR_CANDIDATE_TIMEOUT_MS` | `3000`                      | Wait per locator candidate       |
| `TEST_DATA_DIR`                | `./test-data`               | Location of data files           |

## Docker

```bash
npm run test:docker
```

Uses `mcr.microsoft.com/playwright:v1.65.0-noble`. Keep this tag in sync with
`@playwright/test` in `package.json`. Reports are written to `playwright-report/` on the host.

## CI

`.github/workflows/playwright.yml` runs typecheck, unit tests and browser tests on pushes to
`main` and on pull requests, and uploads the HTML report as an artifact.
