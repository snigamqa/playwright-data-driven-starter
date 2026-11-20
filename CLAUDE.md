# Rules for AI agents working in this repo

Playwright + TypeScript (ESM, NodeNext), data-driven, Page Object Model with audited locator recovery.
Target app: https://www.saucedemo.com (`testIdAttribute` is `data-test`). If a rule blocks the task, STOP and ask — never work around a rule.

## Layout (where things go)
| What | Where |
|---|---|
| Specs | `tests/e2e/*.spec.ts` |
| Page objects | `src/pages/*-page.ts` (extend `BasePage`) |
| Fixtures (page objects are injected here) | `tests/fixtures.ts` |
| Test data (one row = one test) | `test-data/*.json` or `*.csv` |
| Framework code (loaders, recovery) | `src/data`, `src/locators` — changes need a test in `tests/unit` |

## 1. Mandatory workflow for "automate Jira story X"
1. **Read the story** via the Atlassian MCP: summary, description, acceptance criteria (AC), linked issues, comments. Missing/ambiguous AC → ask, don't guess.
2. **Scenario table:** one row per AC plus negative/edge cases the AC implies.
3. **Duplicate check, per scenario** (the index is rebuilt on every call, so it is never stale):
   - `npm run agent:coverage -- <JIRA-KEY>` — what already references this story.
   - `npm run agent:find-test -- "<scenario in plain words>"` — searches static tests **and data rows**.
   - Any hit ≥ 0.30 (`REVIEW`/`LIKELY DUPLICATE`): open the data row/spec and judge by *flow + assertion*, not by score. The score is a retrieval aid.
4. **POM reuse check, per UI action, element and assertion target:**
   - `npm run agent:find-method -- "<action or element>"` — lists methods **and the locator strategies they already use** (including private ones).
   - Open the file. Reuse if the behaviour matches. If it nearly matches, extend with an optional parameter. Create a method only if nothing fits.
5. **Present the plan and wait for approval:**
   `scenario | decision (NEW ROW / NEW TEST / DUPLICATE / EXTEND) | POM reused | POM new | data file`.
6. **Implement** (sections 2–5), then `npm run agent:verify`.
7. **Report:** added, skipped as duplicates (with file/row of the match), POM reused vs created, anything you could not verify (e.g. no network to the app).

## 2. Duplicate prevention (data-driven first)
- Same flow, different inputs/expected result → **add a row** to the existing data file. Do not write a new test, and never copy a spec.
- New test/spec only for a genuinely new flow. One spec per feature area (`login`, `cart`, `checkout`…). Reuse the existing `describe`.
- Row ids continue the file's sequence (`LOGIN-05`, `CART-04`). Ids must be unique; the loader and `agent:check` enforce this.
- Link rows to Jira with a `"jira": "SQA-45"` field (CSV: a `jira` column). Static tests: `{ annotation: { type: 'issue', description: 'SQA-45' } }`. This is what `agent:coverage` reads.
- A test generated from rows must put `${data.id}` in its title.
- Never delete, skip, or weaken an existing test/row to make something pass.

## 3. Page objects
- One class per page/component in `src/pages/`, `extends BasePage`. **Register every new page in `tests/fixtures.ts`** (both the `Fixtures` interface and `base.extend`) — `agent:check` fails otherwise.
- Every element goes through `this.find('<elementName>', [specs])`. Locator methods return `Promise<Locator>`; actions are `async` and return `Promise<void>` (or the next page object).
- Raw `page.locator`/`getBy*` is allowed **only inside a spec's `build: (p) => ...`** or a module-level helper used by one. Never directly in a method body.
- Method names say what the user does or what element it is (`addToCart`, `cartBadge`), not mechanics. Elements used only internally are `private`.
- Page objects contain no assertions (a check helper must be named `expect*`).
- Add a one-line JSDoc to every new public method — the index uses it for search.
- Don't duplicate an element across classes; if two pages share a widget (e.g. header cart), extract a component class.

## 4. Locators (`this.find` specs)
- Order = priority. Primary is the most stable user-facing locator: `getByRole(role, { name })`, `getByLabel`, `getByPlaceholder`, `getByText`, or `getByTestId` (this app exposes `data-test`, so testId is an accepted primary).
- At least **one fallback of a different strategy** (error `locator-needs-fallback`). CSS/XPath only as the **last** fallback, never primary (error `primary-not-css`).
- `description` format: `strategy=value` (e.g. `role=button[name=Login]`, `css=#login-button`) — it appears in recovery reports.
- Scope inside containers with chaining/`filter({ hasText })` (see `item()` in `inventory-page.ts`). `ResilientLocator` applies `.first()`, so each spec must resolve to the *right* element on its own.
- No `nth()` unless order is what is being tested; no auto-generated or layout-dependent selectors.
- **A new locator's primary must work with recovery off:** `npm run test:strict`. If a run reports a `locator-recovery` annotation for something you wrote, fix the primary.

## 5. Writing specs
- `import { expect, test } from '../fixtures.js'` — never from `@playwright/test`. Relative imports end in `.js`.
- Assertions are web-first and on locators: `await expect(await inventoryPage.cartBadge()).toHaveText('1')`. Never `expect(await x.isVisible()).toBe(true)`.
- No `waitForTimeout`, `force: true`, `page.pause`, `.only`. Rely on auto-waiting.
- Tests are independent and parallel-safe (`fullyParallel`): own state, no ordering. Shared setup in `beforeEach` via page objects (see `cart.spec.ts`), not by chaining tests.
- Avoid branching in a test body (`if` is only tolerated in existing code; new code should split rows/tests instead).
- No secrets in repo. Demo-site credentials already in data files are fine; anything real goes through `src/config/env.ts` env vars.

## 6. Forbidden (hard stops)
- Adding a test/row without running `agent:find-test` + `agent:coverage`; adding a POM method/locator without `agent:find-method`.
- Editing `playwright.config.ts`, CI workflow, `tsconfig.json`, or this file unless the user asks.
- Adding dependencies without asking. Committing, pushing, or changing Jira status unless asked.

## 7. Definition of done
- `npm run agent:verify` passes (typecheck → `agent:check` → unit → browser tests with `LOCATOR_RECOVERY=off`).
- New/changed e2e passes three times: `npx playwright test <spec> --repeat-each=3`.
- Every AC maps to a row/test or an explicit "not automatable" note.
- README "Project layout" updated if a folder was added.
- If the browser tests can't run (no network/browsers), say so plainly. Do not claim they passed.
