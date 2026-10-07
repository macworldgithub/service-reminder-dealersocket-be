export const normalizeHeader = (header: string): string => {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
};

export const parseCurrency = (val: any): number | null => {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const cleaned = String(val).replace(/[^0-9.-]+/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
};

export const parseDate = (val: any): Date | null => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  
  const str = String(val).trim();

  // Handle M/D/YYYY or D/M/YYYY or YYYY-MM-DD
  const parts = str.split(/[\/\-.]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      // MM/DD/YYYY
      const mOrD = parseInt(parts[0], 10);
      const dOrM = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      // Store at noon UTC so no timezone conversion shifts the date anywhere in the world
      const candidate = new Date(Date.UTC(y, mOrD - 1, dOrM, 12, 0, 0));
      if (!isNaN(candidate.getTime())) return candidate;
    } else if (parts[0].length === 4) {
      // YYYY-MM-DD
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      const candidate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      if (!isNaN(candidate.getTime())) return candidate;
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  return null;
};

export const detectDataType = (sampleValues: any[]): 'string' | 'number' | 'currency' | 'date' | 'boolean' => {
  const validSamples = sampleValues.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
  if (validSamples.length === 0) return 'string';

  let currencyCount = 0;
  let dateCount = 0;
  let numberCount = 0;
  let booleanCount = 0;

  for (const val of validSamples) {
    const s = String(val).trim();
    if (/^(true|false|yes|no)$/i.test(s)) {
      booleanCount++;
    } else if (/^\$?[0-9,]+(\.[0-9]{2})?$/.test(s) && (s.startsWith('$') || s.includes('.'))) {
      currencyCount++;
    } else if (!isNaN(Number(s)) && !s.includes('-') && !s.includes('/')) {
      numberCount++;
    } else if (parseDate(s) !== null && (s.includes('/') || s.includes('-') || s.includes('.'))) {
      dateCount++;
    }
  }

  const threshold = validSamples.length * 0.6;
  if (currencyCount >= threshold) return 'currency';
  if (dateCount >= threshold) return 'date';
  if (numberCount >= threshold) return 'number';
  if (booleanCount >= threshold) return 'boolean';

  return 'string';
};

export const applyTransformation = (
  value: any,
  dataType?: 'string' | 'number' | 'currency' | 'date' | 'boolean',
  transformation?: 'none' | 'trim' | 'uppercase' | 'lowercase' | 'parse_currency' | 'parse_date'
): any => {
  if (value === null || value === undefined) return null;

  let result = value;

  // Apply explicit transformation
  if (transformation === 'trim' && typeof result === 'string') {
    result = result.trim();
  } else if (transformation === 'uppercase' && typeof result === 'string') {
    result = result.trim().toUpperCase();
  } else if (transformation === 'lowercase' && typeof result === 'string') {
    result = result.trim().toLowerCase();
  } else if (transformation === 'parse_currency') {
    result = parseCurrency(result);
  } else if (transformation === 'parse_date') {
    result = parseDate(result);
  }

  // Type coercion
  if (dataType === 'currency') {
    return parseCurrency(result);
  } else if (dataType === 'number') {
    const num = Number(result);
    return isNaN(num) ? null : num;
  } else if (dataType === 'date') {
    return parseDate(result);
  } else if (dataType === 'boolean') {
    if (typeof result === 'boolean') return result;
    const s = String(result).toLowerCase().trim();
    return s === 'true' || s === 'yes' || s === '1';
  }

  return typeof result === 'string' ? result.trim() : result;
};
