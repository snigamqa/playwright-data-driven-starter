#!/usr/bin/env tsx
/**
 * Indexes what already exists so the AI agent can check BEFORE it writes:
 *  - scenarios: static tests AND data rows (this repo is data-driven: one row = one test)
 *  - page objects: every method, plus the locator strategies each one uses
 *
 *   npm run agent:index
 *   npm run agent:find-test   -- "locked out user cannot log in"
 *   npm run agent:find-method -- "cart badge count"
 *   npm run agent:coverage    -- SQA-45
 */
import fs from 'node:fs';
import path from 'node:path';
import { Node, Project, SyntaxKind, type CallExpression, type SourceFile } from 'ts-morph';
import { parseCsv } from '../../src/data/csv.js';

const ROOT = process.cwd();
const CONFIG = {
  specGlobs: ['tests/e2e/**/*.spec.ts'],
  pageGlobs: ['src/pages/**/*.ts'],
  dataDir: process.env.TEST_DATA_DIR ?? 'test-data',
  indexFile: path.join(ROOT, '.agent', 'framework-index.json'),
};

const JIRA_RE = /\b[A-Z][A-Z0-9]+-\d+\b/g;
const SECRET_KEY = /pass|secret|token|key/i;
const TEST_CALLEE = /^test(\.(only|skip|fixme|fail|slow))?$/;
const LOADERS = new Set(['loadJsonCases', 'loadCsvCases']);
const STOP = new Set(['the', 'and', 'for', 'with', 'user', 'should', 'can', 'able', 'when', 'then', 'page', 'test']);

interface Scenario {
  kind: 'test' | 'data-row';
  id: string;
  file: string;
  text: string;
  jira: string[];
  /** For data rows: the spec tests that run this row. */
  consumers: string[];
}
interface MethodEntry {
  name: string;
  scope: string;
  kind: 'locator' | 'action';
  signature: string;
  returns: string;
  locators: string[];
  doc: string;
}
interface PageEntry {
  file: string;
  class: string;
  extends?: string;
  abstract: boolean;
  properties: string[];
  methods: MethodEntry[];
}
interface Index {
  generatedAt: string;
  scenarios: Scenario[];
  pages: PageEntry[];
}
interface Consumer {
  spec: string;
  describe: string[];
}

const rel = (p: string): string => path.relative(ROOT, p).split(path.sep).join('/');
const unique = (m: RegExpMatchArray | null): string[] => [...new Set(m ?? [])];

function literal(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) return node.getLiteralText();
  if (Node.isTemplateExpression(node)) return node.getText().slice(1, -1);
  return undefined;
}

function describePath(call: CallExpression): string[] {
  const out: string[] = [];
  for (const anc of call.getAncestors()) {
    if (Node.isCallExpression(anc) && anc.getExpression().getText().startsWith('test.describe')) {
      const t = literal(anc.getArguments()[0]);
      if (t) out.unshift(t);
    }
  }
  return out;
}

function scanSpec(sf: SourceFile, scenarios: Scenario[], consumed: Map<string, Consumer[]>): void {
  const file = rel(sf.getFilePath());
  const dataVars = new Map<string, string>();
  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer();
    if (init && Node.isCallExpression(init) && LOADERS.has(init.getExpression().getText())) {
      const dataFile = literal(init.getArguments()[0]);
      if (dataFile) dataVars.set(decl.getName(), dataFile);
    }
  }

  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (!TEST_CALLEE.test(call.getExpression().getText())) continue;
    const title = literal(call.getArguments()[0]);
    if (title === undefined) continue;
    const describe = describePath(call);
    const line = call.getStartLineNumber();
    const loop = call.getFirstAncestorByKind(SyntaxKind.ForOfStatement);
    const dataFile = loop ? dataVars.get(loop.getExpression().getText()) : undefined;

    if (dataFile && title.includes('${')) {
      // Data-driven test: each row of the data file is the real scenario.
      const list = consumed.get(dataFile) ?? [];
      list.push({ spec: `${file}:${line}`, describe });
      consumed.set(dataFile, list);
      continue;
    }
    const details = call.getArguments()[1];
    const detailsText = details && Node.isObjectLiteralExpression(details) ? details.getText() : '';
    const hay = [...describe, title, detailsText].join(' ');
    scenarios.push({
      kind: 'test',
      id: `${file}:${line}`,
      file,
      text: [...describe, title].join(' '),
      jira: unique(hay.match(JIRA_RE)),
      consumers: [],
    });
  }
}

function strategiesOf(call: CallExpression): string[] {
  const arr = call.getArguments()[1];
  if (!arr || !Node.isArrayLiteralExpression(arr)) return [];
  return arr.getElements().flatMap((el) => {
    if (!Node.isObjectLiteralExpression(el)) return [];
    const prop = el.getProperty('description');
    const text = prop && Node.isPropertyAssignment(prop) ? literal(prop.getInitializer()) : undefined;
    return text ? [text] : [];
  });
}

function scanPage(sf: SourceFile, pages: PageEntry[]): void {
  const file = rel(sf.getFilePath());
  for (const cls of sf.getClasses()) {
    const methods: MethodEntry[] = cls.getMethods().map((m) => {
      const finds = m
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter((c) => c.getExpression().getText() === 'this.find');
      const returns = m.getReturnTypeNode()?.getText() ?? 'inferred';
      return {
        name: m.getName(),
        scope: m.getScope(),
        kind: finds.length > 0 && returns.includes('Locator') ? 'locator' : 'action',
        signature: `${m.getName()}(${m.getParameters().map((p) => p.getText()).join(', ')})`,
        returns,
        locators: finds.flatMap(strategiesOf),
        doc: m.getJsDocs().map((d) => d.getDescription().trim()).join(' '),
      };
    });
    pages.push({
      file,
      class: cls.getName() ?? '(anonymous)',
      extends: cls.getExtends()?.getExpression().getText(),
      abstract: cls.isAbstract(),
      properties: cls.getProperties().map((p) => p.getName()),
      methods,
    });
  }
}

function readRows(file: string): Record<string, unknown>[] {
  const raw = fs.readFileSync(path.resolve(ROOT, CONFIG.dataDir, file), 'utf8');
  if (file.endsWith('.json')) {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  }
  return parseCsv(raw) as unknown as Record<string, unknown>[];
}

function rowText(row: Record<string, unknown>): string {
  return Object.entries(row)
    .filter(([k, v]) => !SECRET_KEY.test(k) && typeof v === 'string' && v !== '')
    .map(([, v]) => v as string)
    .join(' ');
}

function rowJira(row: Record<string, unknown>): string[] {
  const v = row.jira ?? row.Jira;
  const s = Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : '';
  return unique(s.match(JIRA_RE));
}

function buildIndex(): Index {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths(CONFIG.specGlobs);
  project.addSourceFilesAtPaths(CONFIG.pageGlobs);

  const scenarios: Scenario[] = [];
  const pages: PageEntry[] = [];
  const consumed = new Map<string, Consumer[]>();

  for (const sf of project.getSourceFiles()) {
    if (rel(sf.getFilePath()).endsWith('.spec.ts')) scanSpec(sf, scenarios, consumed);
    else scanPage(sf, pages);
  }

  const dataDir = path.resolve(ROOT, CONFIG.dataDir);
  const dataFiles = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter((f) => /\.(json|csv)$/.test(f)).sort() : [];
  for (const file of dataFiles) {
    const users = consumed.get(file) ?? [];
    const context = users.map((c) => c.describe.join(' ')).join(' ');
    for (const row of readRows(file)) {
      scenarios.push({
        kind: 'data-row',
        id: String(row.id ?? '?'),
        file: path.posix.join(CONFIG.dataDir, file),
        text: `${context} ${rowText(row)}`.trim(),
        jira: rowJira(row),
        consumers: users.map((c) => c.spec),
      });
    }
  }

  const index: Index = { generatedAt: new Date().toISOString(), scenarios, pages };
  fs.mkdirSync(path.dirname(CONFIG.indexFile), { recursive: true });
  fs.writeFileSync(CONFIG.indexFile, JSON.stringify(index, null, 2));
  return index;
}

const tokens = (s: string): Set<string> =>
  new Set(
    s
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOP.has(t))
      .map((t) => (t.length > 4 ? t.replace(/(ing|ed|es|s)$/, '') : t)),
  );

function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return 0.5 * (inter / Math.min(A.size, B.size)) + 0.5 * (inter / union);
}

const [cmd, ...rest] = process.argv.slice(2);
const query = rest.join(' ').trim();
const need = (usage: string): void => {
  if (!query) throw new Error(`Usage: ${usage}`);
};

// The repo is small, so the index is rebuilt on every call: it can never be stale.
const index = buildIndex();

switch (cmd) {
  case 'index': {
    const rows = index.scenarios.filter((s) => s.kind === 'data-row').length;
    const methods = index.pages.reduce((n, p) => n + p.methods.length, 0);
    console.log(
      `Indexed ${index.scenarios.length - rows} static tests, ${rows} data rows, ${index.pages.length} page classes, ${methods} POM methods -> ${rel(CONFIG.indexFile)}`,
    );
    break;
  }
  case 'find-test': {
    need('find-test "<scenario text>"');
    const hits = index.scenarios
      .map((s) => ({ s, score: similarity(query, s.text) }))
      .filter((h) => h.score > 0.25)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    if (hits.length === 0) console.log('No similar scenarios found.');
    for (const { s, score } of hits) {
      const where = s.kind === 'data-row' ? `${s.file} row ${s.id}  used-by=${s.consumers.join(',') || '-'}` : s.id;
      const flag = score >= 0.6 ? '  <-- LIKELY DUPLICATE' : score >= 0.3 ? '  <-- REVIEW' : '';
      console.log(`${score.toFixed(2)}  ${s.kind}  ${where}  jira=${s.jira.join(',') || '-'}  [${s.text.slice(0, 110)}]${flag}`);
    }
    if (hits.some((h) => h.s.kind === 'data-row')) {
      console.log('Hint: same flow with different data -> add a ROW to the data file, not a new test.');
    }
    break;
  }
  case 'find-method': {
    need('find-method "<action or element>"');
    const hits = index.pages
      .flatMap((p) =>
        p.methods.map((m) => ({ p, m, score: similarity(query, `${m.name} ${p.class} ${m.doc} ${m.locators.join(' ')}`) })),
      )
      .filter((h) => h.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    if (hits.length === 0) console.log('No similar POM methods or locators found.');
    for (const { p, m, score } of hits) {
      const loc = m.locators.length ? `  locators=[${m.locators.join(' | ')}]` : '';
      const flag = score >= 0.6 ? '  <-- REUSE/EXTEND' : score >= 0.3 ? '  <-- REVIEW' : '';
      console.log(`${score.toFixed(2)}  ${p.file}  ${p.class}.${m.signature}: ${m.returns}  (${m.scope} ${m.kind})${loc}${flag}`);
    }
    break;
  }
  case 'coverage': {
    need('coverage <JIRA-KEY>');
    const key = query.toUpperCase();
    const hits = index.scenarios.filter((s) => s.jira.includes(key));
    console.log(
      hits.length
        ? hits.map((s) => `${s.kind}  ${s.kind === 'data-row' ? `${s.file} row ${s.id}` : s.id}  [${s.text.slice(0, 100)}]`).join('\n')
        : `No tests or data rows reference ${key}. (Convention: "jira" field on data rows, annotation on static tests.)`,
    );
    break;
  }
  default:
    console.log('Commands: index | find-test "<text>" | find-method "<text>" | coverage <JIRA-KEY>');
}
