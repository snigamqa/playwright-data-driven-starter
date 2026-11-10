import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv, type CsvRow } from './csv.js';

const DATA_DIR = process.env.TEST_DATA_DIR ?? path.resolve(process.cwd(), 'test-data');

function readDataFile(fileName: string, dataDir: string): string {
  return readFileSync(path.resolve(dataDir, fileName), 'utf8');
}

/** Loads a JSON array of test cases. Every case must have a unique `id` used in the test title. */
export function loadJsonCases<T extends { id: string }>(fileName: string, dataDir = DATA_DIR): T[] {
  const parsed: unknown = JSON.parse(readDataFile(fileName, dataDir));
  if (!Array.isArray(parsed)) throw new Error(`${fileName} must contain a JSON array`);
  assertUniqueIds(parsed as T[], fileName);
  return parsed as T[];
}

/** Loads CSV rows. The file must have an `id` column with unique values. */
export function loadCsvCases(fileName: string, dataDir = DATA_DIR): (CsvRow & { id: string })[] {
  const rows = parseCsv(readDataFile(fileName, dataDir));
  rows.forEach((row, index) => {
    if (!row.id) throw new Error(`${fileName} row ${index + 2} is missing an id`);
  });
  const cases = rows as (CsvRow & { id: string })[];
  assertUniqueIds(cases, fileName);
  return cases;
}

function assertUniqueIds(cases: { id: string }[], fileName: string): void {
  const seen = new Set<string>();
  for (const testCase of cases) {
    if (typeof testCase.id !== 'string' || testCase.id === '') {
      throw new Error(`${fileName} contains a case without a string id`);
    }
    if (seen.has(testCase.id)) throw new Error(`${fileName} has duplicate id "${testCase.id}"`);
    seen.add(testCase.id);
  }
}
