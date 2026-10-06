import * as XLSX from 'xlsx';

export interface XlsxParseResult {
  sheets: string[];
  activeSheet: string;
  headers: string[];
  rows: Record<string, any>[];
  totalRows: number;
}

export class XlsxParser {
  static parse(buffer: Buffer, targetSheetName?: string): XlsxParseResult {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetNames = workbook.SheetNames;

    if (!sheetNames || sheetNames.length === 0) {
      throw new Error('Excel file contains no worksheets');
    }

    const activeSheet = targetSheetName && sheetNames.includes(targetSheetName)
      ? targetSheetName
      : sheetNames[0];

    const worksheet = workbook.Sheets[activeSheet];
    const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      dateNF: 'yyyy-mm-dd',
      defval: '',
    });

    if (rawRows.length === 0) {
      return {
        sheets: sheetNames,
        activeSheet,
        headers: [],
        rows: [],
        totalRows: 0,
      };
    }

    const headers = Object.keys(rawRows[0]);

    return {
      sheets: sheetNames,
      activeSheet,
      headers,
      rows: rawRows,
      totalRows: rawRows.length,
    };
  }
}
