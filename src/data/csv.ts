export type CsvRow = Record<string, string>;

/** Parses RFC 4180-style CSV (quoted fields, escaped quotes, CRLF). First row is the header. */
export function parseCsv(text: string): CsvRow[] {
  const records = splitRecords(text.replace(/^\uFEFF/, ''));
  const header = records.shift();
  if (!header) return [];

  const columns = header.map((name) => name.trim());
  return records
    .filter((fields) => !(fields.length === 1 && fields[0] === ''))
    .map((fields, index) => {
      if (fields.length !== columns.length) {
        throw new Error(
          `CSV row ${index + 2} has ${fields.length} fields, expected ${columns.length}`,
        );
      }
      return Object.fromEntries(columns.map((column, i) => [column, fields[i] ?? '']));
    });
}

function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      fields.push(field);
      records.push(fields);
      fields = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (inQuotes) throw new Error('CSV ends inside a quoted field');
  if (field !== '' || fields.length > 0) {
    fields.push(field);
    records.push(fields);
  }
  return records;
}
