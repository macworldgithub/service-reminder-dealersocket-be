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
    const pagesData: { pageIndex: number; items: any[] }[] = [];

    // Capture text content items with precise X, Y coordinates and dimensions
    const pagerender = (pageData: any) => {
      return pageData.getTextContent().then((textContent: any) => {
        pagesData.push({
          pageIndex: pageData.pageIndex,
          items: textContent.items || [],
        });
        return '';
      });
    };

    let rawText = '';
    try {
      const pdfData = await pdf(buffer, { pagerender });
      rawText = pdfData.text || '';
    } catch (e: any) {
      // In case custom pagerender fails, try basic parse
      const pdfData = await pdf(buffer);
      rawText = pdfData.text || '';
    }

    const metadata: PdfMetadata = {
      reportTitle: 'Campaign Summary Service Detail',
      dealershipName: 'South Morang Hyundai',
    };
    const warnings: string[] = [];

    let headerColumns: { str: string; x: number; w: number; right: number }[] = [];
    let headerY: number | null = null;
    let detectedHeaders: string[] = [];

    const cleanText = (s: string) =>
      (s || '')
        .replace(/\u00a0/g, ' ')
        .replace(/­/g, '-')
        .replace(/\s+/g, ' ')
        .trim();

    // Step 1: Scan for Metadata and Table Header Row using item coordinates
    for (const page of pagesData) {
      const lineMap = new Map<number, any[]>();
      for (const item of page.items) {
        const y = Math.round(item.transform[5]);
        let foundY: number | null = null;
        for (const ey of lineMap.keys()) {
          if (Math.abs(ey - y) <= 2.5) {
            foundY = ey;
            break;
          }
        }
        if (foundY !== null) {
          lineMap.get(foundY)!.push(item);
        } else {
          lineMap.set(y, [item]);
        }
      }

      const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);

      for (const y of sortedYs) {
        const lineItems = lineMap.get(y)!.sort((a, b) => a.transform[4] - b.transform[4]);
        const lineText = lineItems
          .map((i) => cleanText(i.str))
          .filter(Boolean)
          .join(' ');

        if (/Campaign\s*Name:\s*/i.test(lineText)) {
          metadata.campaignName = cleanText(lineText.replace(/.*Campaign\s*Name:\s*/i, ''));
        }
        if (/Report\s*Date:\s*/i.test(lineText)) {
          const m = lineText.match(/Report\s*Date:\s*([^\s]+(?:\s*[-–—]\s*[^\s]+)?)/i);
          if (m) metadata.reportDateRange = cleanText(m[1]);
        }
        if (/Record\s*Count:\s*(\d+)/i.test(lineText)) {
          const m = lineText.match(/Record\s*Count:\s*(\d+)/i);
          if (m) metadata.recordCountExpected = parseInt(m[1], 10);
        }
        if (/South\s*Morang\s*Hyundai/i.test(lineText)) {
          metadata.dealershipName = 'South Morang Hyundai';
        }

        if (
          headerColumns.length === 0 &&
          lineText.includes('Entity') &&
          (lineText.includes('Customer') || lineText.includes('Amount') || lineText.includes('RO'))
        ) {
          headerY = y;
          const rawCols = lineItems
            .map((i) => ({
              str: cleanText(i.str),
              x: i.transform[4],
              w: i.width,
              right: i.transform[4] + i.width,
            }))
            .filter((i) => i.str.length > 0);

          headerColumns = rawCols;
          detectedHeaders = headerColumns.map((h) => h.str);
        }
      }
    }

    // Parse date range if found
    if (metadata.reportDateRange) {
      const dateParts = metadata.reportDateRange.split(/\s*[-–—]\s*|\s+to\s+/i);
      if (dateParts.length === 2) {
        const dFrom = new Date(dateParts[0].trim());
        const dTo = new Date(dateParts[1].trim());
        if (!isNaN(dFrom.getTime())) metadata.reportDateFrom = dFrom;
        if (!isNaN(dTo.getTime())) metadata.reportDateTo = dTo;
      }
    }

    const dataRows: Record<string, any>[] = [];

    // Step 2: Coordinate & token-type based row extraction
    if (headerColumns.length > 0) {
      // Find start of customer name column and insert/event columns from header
      const entityCol = headerColumns.find((h) => /entity/i.test(h.str));
      const customerCol = headerColumns.find((h) => /customer/i.test(h.str));
      const nuCol = headerColumns.find((h) => /n\/u/i.test(h.str));
      const insertCol = headerColumns.find((h) => /insert/i.test(h.str));
      const eventCol = headerColumns.find((h) => /event/i.test(h.str));
      const closeCol = headerColumns.find((h) => /close/i.test(h.str));
      const amountCol = headerColumns.find((h) => /amount/i.test(h.str));

      // Cutoff between Entity ID and Customer Name:
      // Entity IDs always end before x=56. Customer Names always start at x>=56.
      const entityMaxX = 56;
      const nuStartX = nuCol ? nuCol.x - 10 : 220;
      const insertStartX = insertCol ? insertCol.x - 20 : 330;
      const eventStartX = eventCol ? eventCol.x - 15 : 410;
      const closeStartX = closeCol ? closeCol.x - 15 : 450;
      const amountStartX = amountCol ? amountCol.x - 15 : 520;

      for (const page of pagesData) {
        const lineMap = new Map<number, any[]>();
        for (const item of page.items) {
          const y = Math.round(item.transform[5]);
          let foundY: number | null = null;
          for (const ey of lineMap.keys()) {
            if (Math.abs(ey - y) <= 2.5) {
              foundY = ey;
              break;
            }
          }
          if (foundY !== null) {
            lineMap.get(foundY)!.push(item);
          } else {
            lineMap.set(y, [item]);
          }
        }

        const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);

        for (const y of sortedYs) {
          // Skip header and title lines on page 1
          if (page.pageIndex === 0 && headerY !== null && y >= headerY - 2) {
            continue;
          }

          const lineItems = lineMap.get(y)!.sort((a, b) => a.transform[4] - b.transform[4]);
          const lineText = lineItems
            .map((i) => cleanText(i.str))
            .filter(Boolean)
            .join(' ');

          if (
            lineText.includes('Total') ||
            lineText.includes('Confidential') ||
            lineText.startsWith('Page ') ||
            lineText.includes('Campaign Summary') ||
            lineText.includes('Report Date:') ||
            lineText.includes('Record Count:') ||
            lineText.includes('Entity ID')
          ) {
            continue;
          }

          let entityId = '';
          const customerNameParts: string[] = [];
          let nu = '';
          let year = '';
          const makeModelParts: string[] = [];
          let insertDate = '';
          let eventNumber = '';
          let closeDate = '';
          let roAmount = '';

          for (const item of lineItems) {
            const text = cleanText(item.str);
            if (!text) continue;
            const x = item.transform[4];

            // 1. Entity ID: left edge (x < entityMaxX) and numeric/alphanumeric
            if (x < entityMaxX && /^\d+$/.test(text)) {
              entityId = text;
            }
            // 2. Customer Name: between x=56 and N/U / insert date, non-date, non-currency
            else if (
              x >= entityMaxX &&
              x < nuStartX &&
              !/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(text) &&
              !text.startsWith('$')
            ) {
              customerNameParts.push(text);
            }
            // 3. N/U status: single char N or U between 200 and 280
            else if (x >= 200 && x < 280 && (text === 'N' || text === 'U')) {
              nu = text;
            }
            // 4. Vehicle Year: 4-digit year 19xx or 20xx
            else if (x >= 230 && x < 320 && /^(19\d{2}|20\d{2})$/.test(text)) {
              year = text;
            }
            // 5. Vehicle Make / Model
            else if (x >= 260 && x < 350 && !/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(text)) {
              makeModelParts.push(text);
            }
            // 6. Campaign Insert Date
            else if (x >= insertStartX && x < eventStartX && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(text)) {
              insertDate = text;
            }
            // 7. Event#: 5-7 digits
            else if (x >= eventStartX && x < closeStartX && /^\d{5,7}$/.test(text)) {
              eventNumber = text;
            }
            // 8. Close Date
            else if (x >= closeStartX && x < amountStartX && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(text)) {
              closeDate = text;
            }
            // 9. RO Amount: currency
            else if (x >= amountStartX && (text.startsWith('$') || /^\d+[\d,]*\.\d{2}$/.test(text))) {
              roAmount = text;
            }
          }

          // Strict verification: require Entity ID and at least one other field (RO Amount, Close Date, or Customer Name)
          if (entityId && (roAmount || closeDate || customerNameParts.length > 0)) {
            const row: Record<string, any> = {
              'Entity ID': entityId,
              'Customer Name': customerNameParts.join(' ').trim(),
              'N/U': nu,
              'Year': year,
              'Make/Model': makeModelParts.join(' ').trim(),
              'Campaign Insert': insertDate,
              'Event#': eventNumber,
              'Close Date': closeDate,
              'RO Amount': roAmount,
              'Campaign': metadata.campaignName || 'HY Closed RO',
              sourceData: { rawLine: lineText },
            };
            dataRows.push(row);
          }
        }
      }
    }

    // Step 3: Fallback line parser if coordinate extraction yielded no rows
    if (dataRows.length === 0) {
      warnings.push('Coordinate extraction not applicable, using enhanced line parser');
      const lines = rawText
        .split(/\r?\n/)
        .map((l) => cleanText(l))
        .filter((l) => l.length > 0);

      const standardHeaders = [
        'Entity ID',
        'Customer Name',
        'N/U',
        'Year',
        'Make/Model',
        'Campaign Insert',
        'Event#',
        'Close Date',
        'RO Amount',
      ];
      detectedHeaders = standardHeaders;

      for (const line of lines) {
        if (
          /^(Page\s+\d+|Confidential|Total|Summary|Campaign Name:|Report Date:|Record Count:|Report:)/i.test(
            line
          ) ||
          line.startsWith('---') ||
          line.startsWith('===')
        ) {
          continue;
        }

        const currencyMatch = line.match(/\$?(\d+[\d,]*\.\d{2})$/);
        // Strictly match numeric entity digits/ID, NEVER consume letters of customer name
        const entityMatch = line.match(/^(\d{2,8})\b/);

        if (currencyMatch && entityMatch) {
          const entityId = entityMatch[1];
          const roAmount = currencyMatch[0];
          const remainder = line.substring(entityId.length, line.length - roAmount.length).trim();

          const dateMatches = [...remainder.matchAll(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g)];
          let insertDate = '';
          let closeDate = '';
          if (dateMatches.length >= 2) {
            insertDate = dateMatches[0][0];
            closeDate = dateMatches[1][0];
          } else if (dateMatches.length === 1) {
            closeDate = dateMatches[0][0];
          }

          const eventMatch = remainder.match(/(?:EV-?|\b)(\d{5,7})\b/i);
          const eventNumber = eventMatch ? eventMatch[1] : '';

          // Match customer name from start up to date or event
          let customerName = remainder;
          if (insertDate) {
            customerName = customerName.substring(0, customerName.indexOf(insertDate)).trim();
          } else if (closeDate) {
            customerName = customerName.substring(0, customerName.indexOf(closeDate)).trim();
          } else if (eventNumber) {
            customerName = customerName.substring(0, customerName.indexOf(eventNumber)).trim();
          }

          dataRows.push({
            'Entity ID': entityId,
            'Customer Name': customerName || 'Unknown',
            'N/U': '',
            'Year': '',
            'Make/Model': 'Hyundai',
            'Campaign Insert': insertDate,
            'Event#': eventNumber,
            'Close Date': closeDate,
            'RO Amount': roAmount,
            'Campaign': metadata.campaignName || 'HY Closed RO',
            sourceData: { rawLine: line },
          });
        }
      }
    }

    let confidence: 'high' | 'medium' | 'low' = 'high';
    if (dataRows.length === 0) {
      confidence = 'low';
      warnings.push('Could not extract tabular records from the PDF. Manual review recommended.');
    } else if (metadata.recordCountExpected && dataRows.length < metadata.recordCountExpected * 0.7) {
      confidence = 'medium';
      warnings.push(
        `Extracted ${dataRows.length} rows, but PDF header indicated ${metadata.recordCountExpected} records.`
      );
    }

    return {
      metadata,
      headers: detectedHeaders.length > 0 ? detectedHeaders : [
        'Entity ID',
        'Customer Name',
        'N/U',
        'Year',
        'Make/Model',
        'Campaign Insert',
        'Event#',
        'Close Date',
        'RO Amount',
      ],
      rows: dataRows,
      totalRows: dataRows.length,
      confidence,
      warnings,
      rawText,
    };
  }
}
