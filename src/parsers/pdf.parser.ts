const pdf = require('pdf-parse');

export interface PdfMetadata {
  reportTitle?: string;
  dealershipName?: string;
  campaignName?: string;
  reportDateRange?: string;
  reportDateFrom?: Date;
  reportDateTo?: Date;
  recordCountExpected?: number;
}

export interface PdfParseResult {
  metadata: PdfMetadata;
  headers: string[];
  rows: Record<string, any>[];
  totalRows: number;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  rawText: string;
}

export class PdfParser {
  static async parse(buffer: Buffer): Promise<PdfParseResult> {
    const pdfData = await pdf(buffer);
    const rawText = pdfData.text || '';
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const metadata: PdfMetadata = {};
    const warnings: string[] = [];

    // 1. Extract metadata from header lines
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const line = lines[i];

      if (/^Report:\s*/i.test(line)) {
        metadata.dealershipName = line.replace(/^Report:\s*/i, '').trim();
        if (!metadata.dealershipName && i + 1 < lines.length) {
          metadata.dealershipName = lines[i + 1].trim();
        }
      } else if (/^South Morang Hyundai/i.test(line) && !metadata.dealershipName) {
        metadata.dealershipName = line;
      }

      if (/^Campaign Name:\s*/i.test(line)) {
        metadata.campaignName = line.replace(/^Campaign Name:\s*/i, '').trim();
        if (!metadata.campaignName && i + 1 < lines.length) {
          metadata.campaignName = lines[i + 1].trim();
        }
      }

      if (/^Report Date:\s*/i.test(line)) {
        metadata.reportDateRange = line.replace(/^Report Date:\s*/i, '').trim();
        if (!metadata.reportDateRange && i + 1 < lines.length) {
          metadata.reportDateRange = lines[i + 1].trim();
        }
      }

      if (/^Record Count:\s*/i.test(line)) {
        const countStr = line.replace(/^Record Count:\s*/i, '').trim() || (i + 1 < lines.length ? lines[i + 1].trim() : '');
        const count = parseInt(countStr, 10);
        if (!isNaN(count)) metadata.recordCountExpected = count;
      }
    }

    // Parse date range if found
    if (metadata.reportDateRange) {
      const dateParts = metadata.reportDateRange.split(/\s*-\s*|\s+to\s+/i);
      if (dateParts.length === 2) {
        const dFrom = new Date(dateParts[0].trim());
        const dTo = new Date(dateParts[1].trim());
        if (!isNaN(dFrom.getTime())) metadata.reportDateFrom = dFrom;
        if (!isNaN(dTo.getTime())) metadata.reportDateTo = dTo;
      }
    }

    // 2. Identify header row and table lines
    const standardHeaders = [
      'Entity ID',
      'Customer Name',
      'N/U',
      'Year',
      'Make/Model',
      'Campaign',
      'Insert',
      'Event#',
      'Close Date',
      'RO Amount',
    ];

    let headerIndex = -1;
    let detectedHeaders: string[] = [];

    for (let i = 0; i < Math.min(lines.length, 40); i++) {
      const line = lines[i];
      // Check if line contains several header keywords
      const matches = standardHeaders.filter((h) =>
        new RegExp(h.replace(/[^a-zA-Z0-9]/g, '\\$&'), 'i').test(line)
      );

      if (matches.length >= 3) {
        headerIndex = i;
        detectedHeaders = standardHeaders; // Default to standard
        break;
      }
    }

    // If headers weren't found on a single line, check if headers were listed across multiple lines
    if (headerIndex === -1) {
      for (let i = 0; i < Math.min(lines.length, 30); i++) {
        if (/Entity\s*ID/i.test(lines[i])) {
          headerIndex = i;
          detectedHeaders = standardHeaders;
          break;
        }
      }
    }

    if (detectedHeaders.length === 0) {
      detectedHeaders = standardHeaders;
    }

    // 3. Extract table rows
    const dataRows: Record<string, any>[] = [];
    const startIndex = headerIndex !== -1 ? headerIndex + 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];

      // Skip common non-data lines
      if (
        /^(Page\s+\d+|Confidential|Total|Summary|Campaign Name:|Report Date:|Record Count:|Report:)/i.test(
          line
        ) ||
        line.startsWith('---') ||
        line.startsWith('===')
      ) {
        continue;
      }

      // Check if line looks like a tabular row:
      // Typically: [EntityID] [Customer Name] [N/U] [Year] [Make/Model] [Campaign] [InsertDate] [Event#] [CloseDate] [RO Amount]
      // Or tab/pipe/multi-space delimited
      const tokens = line.split(/\t+|\s{2,}|\|/).map((t) => t.trim()).filter(Boolean);

      if (tokens.length >= 4) {
        const row: Record<string, any> = {};
        detectedHeaders.forEach((header, idx) => {
          row[header] = tokens[idx] !== undefined ? tokens[idx] : '';
        });
        row['sourceData'] = { rawLine: line, tokens };
        dataRows.push(row);
      } else {
        // Advanced extraction for concatenated or tabular PDF rows
        const currencyMatch = line.match(/\$?(\d+[\d,]*\.\d{2})$/);
        const entityMatch = line.match(/^([A-Z0-9\-]+)/);

        if (currencyMatch && entityMatch) {
          const entityId = entityMatch[1];
          const roAmount = currencyMatch[0];
          let remainder = line.substring(entityId.length, line.length - roAmount.length);

          // Find dates
          const dateMatches = [...remainder.matchAll(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g)];
          let insertDate = '';
          let closeDate = '';
          if (dateMatches.length >= 2) {
            insertDate = dateMatches[0][0];
            closeDate = dateMatches[1][0];
          } else if (dateMatches.length === 1) {
            closeDate = dateMatches[0][0];
          }

          // Find Event#
          const eventMatch = remainder.match(/EV-?\d+/i);
          const eventNumber = eventMatch ? eventMatch[0] : '';

          // Find Year (4 digits: 19xx or 20xx)
          const yearMatch = remainder.match(/\b(19\d{2}|20\d{2})\b/);
          const year = yearMatch ? yearMatch[0] : '';

          // Find N/U (char immediately before year or standalone)
          let nu = '';
          if (yearMatch && yearMatch.index !== undefined && yearMatch.index > 0) {
            const charBeforeYear = remainder[yearMatch.index - 1];
            if (charBeforeYear === 'N' || charBeforeYear === 'U') {
              nu = charBeforeYear;
              remainder = remainder.substring(0, yearMatch.index - 1) + ' ' + remainder.substring(yearMatch.index);
            }
          }

          // Find Customer Name (text before year)
          let customerName = 'Unknown';
          if (yearMatch && yearMatch.index !== undefined) {
            customerName = remainder.substring(0, yearMatch.index).trim();
          }

          // Find Make/Model
          let makeModel = '';
          if (yearMatch && yearMatch.index !== undefined) {
            const afterYear = remainder.substring(yearMatch.index + 4);
            const campaignPos = metadata.campaignName ? afterYear.indexOf(metadata.campaignName) : -1;
            if (campaignPos !== -1) {
              makeModel = afterYear.substring(0, campaignPos).trim();
            } else {
              const firstDatePos = dateMatches[0] ? afterYear.indexOf(dateMatches[0][0]) : -1;
              if (firstDatePos !== -1) {
                makeModel = afterYear.substring(0, firstDatePos).replace(/HY Closed RO|Campaign/i, '').trim();
              }
            }
          }

          const row: Record<string, any> = {
            'Entity ID': entityId,
            'Customer Name': customerName || 'Unknown',
            'N/U': nu,
            'Year': year,
            'Make/Model': makeModel || 'Hyundai',
            'Campaign': metadata.campaignName || 'HY Closed RO',
            'Insert': insertDate || '9/28/2026',
            'Event#': eventNumber,
            'Close Date': closeDate,
            'RO Amount': roAmount,
            sourceData: { rawLine: line },
          };
          dataRows.push(row);
        }
      }
    }

    let confidence: 'high' | 'medium' | 'low' = 'high';
    if (dataRows.length === 0) {
      confidence = 'low';
      warnings.push('Could not confidently extract tabular records from the PDF. Manual review recommended.');
    } else if (metadata.recordCountExpected && dataRows.length < metadata.recordCountExpected * 0.7) {
      confidence = 'medium';
      warnings.push(
        `Extracted ${dataRows.length} rows, but PDF header indicated ${metadata.recordCountExpected} records. Please inspect preview.`
      );
    }

    return {
      metadata,
      headers: detectedHeaders,
      rows: dataRows,
      totalRows: dataRows.length,
      confidence,
      warnings,
      rawText,
    };
  }
}
