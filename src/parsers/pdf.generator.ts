import PDFDocument from 'pdfkit';
import { IReportRecord } from '../models/ReportRecord.model';
import { IReport } from '../models/Report.model';
import { IPdfTemplateSettings } from '../models/Template.model';

export class PdfGenerator {
  static extractFieldValue(rec: any, fieldKey: string): string {
    if (!fieldKey || !rec) return '';

    // Standard direct/known fields
    if (fieldKey === 'externalEntityId') return rec.externalEntityId || '';
    if (fieldKey === 'customerName') return rec.customerName || '';
    if (fieldKey === 'customerEmail' || fieldKey === 'email' || fieldKey === 'Email') {
      return rec.customerEmail || rec.customFields?.customerEmail || rec.customFields?.email || rec.sourceData?.Email || rec.sourceData?.email || '';
    }
    if (fieldKey === 'customerPhone' || fieldKey === 'phone' || fieldKey === 'Phone') {
      return rec.customerPhone || rec.customFields?.customerPhone || rec.customFields?.phone || rec.sourceData?.Phone || rec.sourceData?.phone || '';
    }
    if (fieldKey === 'vehicle.year' || fieldKey === 'year') {
      return rec.vehicle?.year ? String(rec.vehicle.year) : (rec.year ? String(rec.year) : '');
    }
    if (fieldKey === 'vehicle.make' || fieldKey === 'make') {
      return rec.vehicle?.make || rec.make || '';
    }
    if (fieldKey === 'vehicle.model' || fieldKey === 'model') {
      return rec.vehicle?.model || rec.model || '';
    }
    if (fieldKey === 'vehicle.vin' || fieldKey === 'vin' || fieldKey === 'VIN') {
      return rec.vehicle?.vin || rec.vin || rec.sourceData?.VIN || rec.sourceData?.vin || '';
    }
    if (fieldKey === 'vehicle' || fieldKey === 'vehicle.combined') {
      return [rec.vehicle?.year, rec.vehicle?.make, rec.vehicle?.model].filter(Boolean).join(' ') || '';
    }
    if (fieldKey === 'campaignName' || fieldKey === 'campaign') return rec.campaignName || '';
    if (fieldKey === 'campaignInsertDate') {
      return rec.campaignInsertDate ? new Date(rec.campaignInsertDate).toLocaleDateString() : '';
    }
    if (fieldKey === 'eventNumber' || fieldKey === 'event') return rec.eventNumber || '';
    if (fieldKey === 'closeDate') {
      return rec.closeDate ? new Date(rec.closeDate).toLocaleDateString() : '';
    }
    if (fieldKey === 'roAmount') {
      return rec.roAmount !== undefined && rec.roAmount !== null ? `$${Number(rec.roAmount).toFixed(2)}` : '';
    }
    if (fieldKey === 'recordStatus' || fieldKey === 'status') {
      return rec.recordStatus || '';
    }
    if (fieldKey === 'validationNotes') {
      return Array.isArray(rec.validationNotes) ? rec.validationNotes.join('; ') : '';
    }
    if (fieldKey === 'nOrU' || fieldKey === 'nu' || fieldKey === 'N/U') {
      return rec.customFields?.nOrU || rec.customFields?.nu || rec.sourceData?.['N/U'] || rec.sourceData?.NU || '';
    }

    // Nested property resolution (e.g. "vehicle.trim", "sourceData.Technician")
    if (fieldKey.includes('.')) {
      const parts = fieldKey.split('.');
      let val = rec;
      for (const p of parts) {
        val = val?.[p];
      }
      if (val !== undefined && val !== null) {
        if (val instanceof Date) return val.toLocaleDateString();
        return String(val);
      }
    }

    // Direct match on record
    if (rec[fieldKey] !== undefined && rec[fieldKey] !== null) {
      const val = rec[fieldKey];
      if (val instanceof Date) return val.toLocaleDateString();
      return String(val);
    }

    // Check customFields
    if (rec.customFields?.[fieldKey] !== undefined && rec.customFields?.[fieldKey] !== null) {
      return String(rec.customFields[fieldKey]);
    }

    // Check sourceData (exact match and case-insensitive match)
    if (rec.sourceData) {
      if (rec.sourceData[fieldKey] !== undefined && rec.sourceData[fieldKey] !== null) {
        return String(rec.sourceData[fieldKey]);
      }
      const lowerKey = fieldKey.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const [k, v] of Object.entries(rec.sourceData)) {
        if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === lowerKey) {
          return String(v);
        }
      }
    }

    return '';
  }

  static generateReportPdf(
    report: IReport,
    records: IReportRecord[],
    templateSettings?: IPdfTemplateSettings
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 36,
        size: 'A4',
        layout: 'landscape',
        info: {
          Title: report.name || 'DealerSocket Campaign Report',
          Author: 'DealerSocket Operations Hub',
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const settings: IPdfTemplateSettings = templateSettings || {
        reportTitle: 'Campaign Summary',
        subtitle: 'Service Detail',
        headerDealershipName: report.name || 'South Morang Hyundai',
        campaignLabel: report.campaignName || 'HY Closed RO',
        dateRangeText:
          report.reportDateFrom && report.reportDateTo
            ? `${new Date(report.reportDateFrom).toLocaleDateString()} - ${new Date(report.reportDateTo).toLocaleDateString()}`
            : '9/28/2026 - 10/5/2026',
        primaryColor: '#0f172a',
        showSummaryMetrics: true,
        columns: [
          { field: 'externalEntityId', label: 'Entity ID', visible: true },
          { field: 'customerName', label: 'Customer Name', visible: true },
          { field: 'vehicle.year', label: 'Year', visible: true },
          { field: 'vehicle.model', label: 'Make/Model', visible: true },
          { field: 'campaignName', label: 'Campaign', visible: true },
          { field: 'eventNumber', label: 'Event#', visible: true },
          { field: 'closeDate', label: 'Close Date', visible: true },
          { field: 'roAmount', label: 'RO Amount', visible: true },
        ],
        footerNotes: 'DealerSocket Operations Management System - Confidential',
      };

      // Header Banner
      doc.rect(36, 36, 770, 70).fill('#f8fafc');
      doc.rect(36, 36, 770, 70).stroke('#e2e8f0');

      // Title & Subtitle
      doc.fillColor(settings.primaryColor || '#0f172a')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(settings.reportTitle, 50, 48);

      if (settings.subtitle) {
        doc.fontSize(11)
          .font('Helvetica')
          .fillColor('#64748b')
          .text(settings.subtitle, 50, 70);
      }

      // Metadata details on the right
      const rightX = 480;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#334155').text('Report:', rightX, 46);
      doc.font('Helvetica').fillColor('#0f172a').text(settings.headerDealershipName || 'Dealership', rightX + 60, 46);

      doc.font('Helvetica-Bold').fillColor('#334155').text('Campaign:', rightX, 60);
      doc.font('Helvetica').fillColor('#0f172a').text(settings.campaignLabel || 'Campaign', rightX + 60, 60);

      doc.font('Helvetica-Bold').fillColor('#334155').text('Period:', rightX, 74);
      doc.font('Helvetica').fillColor('#0f172a').text(settings.dateRangeText || 'N/A', rightX + 60, 74);

      doc.font('Helvetica-Bold').fillColor('#334155').text('Records:', rightX + 220, 74);
      doc.font('Helvetica-Bold').fillColor('#2563eb').text(String(records.length || report.recordCount || 0), rightX + 265, 74);

      // Table Setup
      const activeColumns = (settings.columns || []).filter((c: any) => c.visible !== false);
      const startY = 120;
      let currentY = startY;
      const colWidth = 770 / Math.max(activeColumns.length, 1);

      // Table Header Row
      doc.rect(36, currentY, 770, 24).fill(settings.primaryColor || '#0f172a');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');

      activeColumns.forEach((col: any, idx: number) => {
        doc.text(col.label.toUpperCase(), 42 + idx * colWidth, currentY + 7, {
          width: colWidth - 10,
          ellipsis: true,
        });
      });

      currentY += 24;

      // Table Data Rows
      doc.font('Helvetica').fontSize(8);

      records.forEach((rec, rowIndex) => {
        // Page break if near bottom
        if (currentY > 520) {
          doc.addPage({ margin: 36, size: 'A4', layout: 'landscape' });
          currentY = 40;

          // Repeat header on new page
          doc.rect(36, currentY, 770, 20).fill(settings.primaryColor || '#0f172a');
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
          activeColumns.forEach((col: any, idx: number) => {
            doc.text(col.label.toUpperCase(), 42 + idx * colWidth, currentY + 5, {
              width: colWidth - 10,
              ellipsis: true,
            });
          });
          currentY += 20;
          doc.font('Helvetica').fontSize(8);
        }

        // Alternating row background
        if (rowIndex % 2 === 1) {
          doc.rect(36, currentY, 770, 18).fill('#f8fafc');
        }
        doc.rect(36, currentY, 770, 18).stroke('#f1f5f9');

        doc.fillColor('#1e293b');

        activeColumns.forEach((col: any, idx: number) => {
          const fieldKey = col.field || col.key || '';
          const val = PdfGenerator.extractFieldValue(rec, fieldKey);

          doc.text(String(val), 42 + idx * colWidth, currentY + 4, {
            width: colWidth - 10,
            ellipsis: true,
          });
        });

        currentY += 18;
      });

      // Footer
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor('#94a3b8').text(
          `${settings.footerNotes || 'DealerSocket Operations'} | Generated on ${new Date().toLocaleDateString()}`,
          36,
          560,
          { align: 'left', width: 400 }
        );
        doc.fontSize(8).fillColor('#94a3b8').text(
          `Page ${i + 1} of ${totalPages}`,
          600,
          560,
          { align: 'right', width: 200 }
        );
      }

      doc.end();
    });
  }
}
