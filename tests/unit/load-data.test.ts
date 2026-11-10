import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { loadCsvCases, loadJsonCases } from '../../src/data/load-data.js';

function dataDir(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'pw-data-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content);
  return dir;
}

describe('loadJsonCases', () => {
  it('loads an array of cases', () => {
    const dir = dataDir({ 'c.json': '[{"id":"A"},{"id":"B"}]' });
    assert.deepEqual(loadJsonCases('c.json', dir), [{ id: 'A' }, { id: 'B' }]);
  });

  it('rejects non-array content, missing ids and duplicate ids', () => {
    const dir = dataDir({
      'obj.json': '{"id":"A"}',
      'noid.json': '[{"name":"x"}]',
      'dup.json': '[{"id":"A"},{"id":"A"}]',
    });
    assert.throws(() => loadJsonCases('obj.json', dir), /must contain a JSON array/);
    assert.throws(() => loadJsonCases('noid.json', dir), /without a string id/);
    assert.throws(() => loadJsonCases('dup.json', dir), /duplicate id "A"/);
  });
});

describe('loadCsvCases', () => {
  it('loads rows and requires unique ids', () => {
    const dir = dataDir({
      'ok.csv': 'id,product\nA,Backpack\n',
      'blank.csv': 'id,product\n,Backpack\n',
      'dup.csv': 'id\nA\nA\n',
    });
    assert.deepEqual(loadCsvCases('ok.csv', dir), [{ id: 'A', product: 'Backpack' }]);
    assert.throws(() => loadCsvCases('blank.csv', dir), /row 2 is missing an id/);
    assert.throws(() => loadCsvCases('dup.csv', dir), /duplicate id "A"/);
  });
});
