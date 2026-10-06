import { parse } from 'csv-parse/sync';

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, any>[];
  totalRows: number;
  metadata?: {
    delimiter: string;
    encoding: string;
  };
}

export class CsvParser {
  static parse(buffer: Buffer): CsvParseResult {
    const content = buffer.toString('utf-8');

    // Auto-detect delimiter
    let delimiter = ',';
    const firstLine = content.split(/\r?\n/)[0] || '';
    if ((firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length) {
      delimiter = ';';
    } else if ((firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length) {
      delimiter = '\t';
    }

    const records = parse(content, {
      delimiter,
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    const headers = records.length > 0 ? Object.keys(records[0]) : [];

    return {
      headers,
      rows: records,
      totalRows: records.length,
      metadata: {
        delimiter,
        encoding: 'utf-8',
      },
    };
  }
}
