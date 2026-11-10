import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCsv } from '../../src/data/csv.js';

describe('parseCsv', () => {
  it('maps rows to header columns and ignores blank trailing lines', () => {
    assert.deepEqual(parseCsv('id,product\nA,Backpack\n\n'), [{ id: 'A', product: 'Backpack' }]);
  });

  it('handles quoted fields with commas, escaped quotes, newlines and CRLF', () => {
    const rows = parseCsv('id,note\r\n1,"a, ""b""\nc"\r\n2,plain');
    assert.deepEqual(rows, [
      { id: '1', note: 'a, "b"\nc' },
      { id: '2', note: 'plain' },
    ]);
  });

  it('strips a UTF-8 BOM from the header', () => {
    assert.deepEqual(parseCsv('\uFEFFid\n1'), [{ id: '1' }]);
  });

  it('rejects rows with the wrong number of fields', () => {
    assert.throws(() => parseCsv('id,product\n1'), /row 2 has 1 fields, expected 2/);
  });

  it('rejects an unterminated quoted field', () => {
    assert.throws(() => parseCsv('id\n"open'), /quoted field/);
  });
});
