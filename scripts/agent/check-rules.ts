#!/usr/bin/env tsx
/**
 * Static checks for the framework rules in CLAUDE.md. Uses ts-morph (not ESLint) because
 * typescript-eslint does not support this repo's TypeScript 7 yet.
 *
 *   npm run agent:check
 * Exits 1 on any error. Warnings are printed but do not fail the run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Node, Project, SyntaxKind, type SourceFile } from 'ts-morph';

const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, process.env.TEST_DATA_DIR ?? 'test-data');
const TEST_CALLEE = /^test(\.(only|skip|fixme|fail|slow))?$/;
const LOCATOR_FACTORIES = /^(locator|frameLocator|getBy[A-Z]\w*|\$|\$\$|\$eval|\$\$eval)$/;
const STATE_READERS = new Set([
  'isVisible', 'isHidden', 'isEnabled', 'isDisabled', 'isChecked', 'isEditable',
  'textContent', 'innerText', 'innerHTML', 'inputValue', 'getAttribute', 'count',
]);

interface Finding {
  level: 'error' | 'warn';
  rule: string;
  file: string;
  line: number;
  message: string;
}
const findings: Finding[] = [];
const rel = (p: string): string => path.relative(ROOT, p).split(path.sep).join('/');
const add = (level: Finding['level'], rule: string, node: Node, message: string): void => {
  findings.push({ level, rule, file: rel(node.getSourceFile().getFilePath()), line: node.getStartLineNumber(), message });
};

function commonChecks(sf: SourceFile): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    const name = callee.getName();
    if (name === 'waitForTimeout') add('error', 'no-wait-for-timeout', call, 'Use web-first assertions / auto-waiting, not fixed sleeps.');
    if (name === 'pause') add('error', 'no-pause', call, 'Remove page.pause() before committing.');
  }
  for (const prop of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    if (prop.getName() === 'force' && prop.getInitializer()?.getText() === 'true') {
      add('error', 'no-force', prop, '`force: true` hides real usability problems. Fix the locator or the wait instead.');
    }
  }
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (spec.startsWith('.') && !/\.(js|json)$/.test(spec)) {
      add('error', 'esm-js-extension', imp, `Relative import "${spec}" must end in .js (NodeNext ESM).`);
    }
  }
}

function specChecks(sf: SourceFile): void {
  for (const imp of sf.getImportDeclarations()) {
    if (imp.getModuleSpecifierValue() === '@playwright/test') {
      add('error', 'import-from-fixtures', imp, "Import { test, expect } from '../fixtures.js' so page objects and the recovery audit are wired in.");
    }
  }
  for (const access of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const base = access.getExpression().getText();
    if (access.getName() === 'only' && (base === 'test' || base.startsWith('test.describe'))) {
      add('error', 'no-only', access, 'Remove .only before committing.');
    }
  }
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (Node.isPropertyAccessExpression(callee) && LOCATOR_FACTORIES.test(callee.getName())) {
      add('error', 'spec-no-locators', call, `Locator "${callee.getName()}" in a spec. Add or reuse a page-object method instead.`);
    }
    if (callee.getText() === 'expect') {
      const arg = call.getArguments()[0];
      if (arg && Node.isAwaitExpression(arg)) {
        const inner = arg.getExpression();
        if (Node.isCallExpression(inner)) {
          const fn = inner.getExpression();
          if (Node.isPropertyAccessExpression(fn) && STATE_READERS.has(fn.getName())) {
            add('error', 'web-first-assertions', call, `expect(await x.${fn.getName()}()) does not retry. Use expect(locator).toBeVisible()/toHaveText()/...`);
          }
        }
      }
    }
    if (TEST_CALLEE.test(callee.getText())) {
      const title = call.getArguments()[0];
      const titleText = title?.getText() ?? '';
      if (call.getFirstAncestorByKind(SyntaxKind.ForOfStatement) && !/\$\{[^}]*\bid\b[^}]*\}/.test(titleText)) {
        add('error', 'data-driven-title-needs-id', call, 'Tests generated from data rows must include ${data.id} in the title.');
      }
      const cb = call.getArguments().at(-1);
      if (cb && (Node.isArrowFunction(cb) || Node.isFunctionExpression(cb))) {
        const cond = cb
          .getDescendants()
          .find((d) => Node.isIfStatement(d) || Node.isConditionalExpression(d) || Node.isTryStatement(d) || Node.isSwitchStatement(d));
        if (cond) add('warn', 'no-conditional-in-test', cond, 'Branching inside a test hides intent. Prefer separate rows/tests.');
      }
    }
  }
}

function pageChecks(sf: SourceFile): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    const ancestors = call.getAncestors();
    if (Node.isPropertyAccessExpression(callee) && LOCATOR_FACTORIES.test(callee.getName())) {
      const inBuild = ancestors.some((a) => Node.isPropertyAssignment(a) && a.getName() === 'build');
      const inClassMethod = ancestors.some((a) => Node.isMethodDeclaration(a));
      if (inClassMethod && !inBuild) {
        add('error', 'page-locators-via-find', call, 'Declare locators through this.find(name, [specs]); raw locators belong only inside a spec\'s build().');
      }
    }
    if (callee.getText() === 'expect') {
      const method = ancestors.find(Node.isMethodDeclaration);
      if (method && !method.getName().startsWith('expect')) {
        add('error', 'no-assertions-in-pages', call, 'Assertions live in specs. If a page-level check is needed, name the method expect*().');
      }
    }
    if (callee.getText() === 'this.find') {
      const specs = call.getArguments()[1];
      if (!specs || !Node.isArrayLiteralExpression(specs)) continue;
      const items = specs.getElements();
      if (items.length < 2) add('error', 'locator-needs-fallback', call, 'Every element needs a primary plus at least one fallback of a different strategy.');
      const first = items[0];
      if (first && Node.isObjectLiteralExpression(first)) {
        const d = first.getProperty('description');
        const text = d && Node.isPropertyAssignment(d) ? d.getInitializer()?.getText() ?? '' : '';
        if (/^['"`](css|xpath)=/.test(text)) add('error', 'primary-not-css', first, 'Primary locator must not be CSS/XPath; use role/label/text/testId first and keep CSS as a last fallback.');
      }
    }
  }
}

function dataChecks(): void {
  if (!fs.existsSync(DATA_DIR)) return;
  for (const file of fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'))) {
    const full = path.join(DATA_DIR, file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      findings.push({ level: 'error', rule: 'data-valid-json', file: rel(full), line: 1, message: String(e) });
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const seen = new Set<string>();
    for (const row of parsed as { id?: unknown }[]) {
      const id = typeof row.id === 'string' ? row.id : '';
      if (!id || seen.has(id)) findings.push({ level: 'error', rule: 'data-unique-id', file: rel(full), line: 1, message: `Missing or duplicate id "${id}".` });
      seen.add(id);
    }
  }
}

const project = new Project({ skipAddingFilesFromTsConfig: true });
project.addSourceFilesAtPaths(['tests/**/*.ts', 'src/**/*.ts']);

const fixtures = fs.existsSync('tests/fixtures.ts') ? fs.readFileSync('tests/fixtures.ts', 'utf8') : '';
for (const sf of project.getSourceFiles()) {
  const file = rel(sf.getFilePath());
  commonChecks(sf);
  if (file.startsWith('tests/e2e/')) specChecks(sf);
  if (file.startsWith('src/pages/')) {
    pageChecks(sf);
    for (const cls of sf.getClasses()) {
      if (cls.getExtends()?.getExpression().getText() === 'BasePage' && !cls.isAbstract() && !fixtures.includes(`new ${cls.getName()}(`)) {
        add('error', 'page-not-in-fixtures', cls, `${cls.getName()} must be registered in tests/fixtures.ts (Fixtures interface + base.extend).`);
      }
    }
  }
}
dataChecks();

for (const f of findings) console.log(`${f.level.toUpperCase().padEnd(5)} ${f.file}:${f.line} [${f.rule}] ${f.message}`);
const errors = findings.filter((f) => f.level === 'error').length;
console.log(`\nagent:check ${errors === 0 ? 'passed' : 'FAILED'} - ${errors} error(s), ${findings.length - errors} warning(s).`);
process.exit(errors === 0 ? 0 : 1);
