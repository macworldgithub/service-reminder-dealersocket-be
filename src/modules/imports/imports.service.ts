import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IImport, ImportStatus, IValidationError } from '../../models/Import.model';
import { IReport } from '../../models/Report.model';
import { IReportRecord } from '../../models/ReportRecord.model';
import { IColumnMapping } from '../../models/ColumnMapping.model';
import { CsvParser } from '../../parsers/csv.parser';
import { XlsxParser } from '../../parsers/xlsx.parser';
import { PdfParser } from '../../parsers/pdf.parser';
import { AuditService } from '../audit/audit.service';
import {
  normalizeHeader,
  parseCurrency,
  parseDate,
  detectDataType,
  applyTransformation,
} from '../../utils/dataTransformation';

export interface ColumnMappingDefinition {
  sourceColumn: string;
  targetField: string;
  dataType: 'string' | 'number' | 'currency' | 'date' | 'boolean';
  transformation?: 'none' | 'trim' | 'uppercase' | 'lowercase' | 'parse_currency' | 'parse_date';
  isRequired?: boolean;
}

@Injectable()
export class ImportsService {
  constructor(
    @InjectModel('Import') private importModel: Model<IImport>,
    @InjectModel('Report') private reportModel: Model<IReport>,
    @InjectModel('ReportRecord') private reportRecordModel: Model<IReportRecord>,
    @InjectModel('ColumnMapping') private mappingModel: Model<IColumnMapping>,
    private auditService: AuditService
  ) {}

  // Standard internal target field definitions
  private standardTargetFields = [
    { key: 'externalEntityId', label: 'Entity ID', type: 'string' },
    { key: 'customerName', label: 'Customer Name', type: 'string' },
    { key: 'vehicle.year', label: 'Vehicle Year', type: 'number' },
    { key: 'vehicle.make', label: 'Vehicle Make', type: 'string' },
    { key: 'vehicle.model', label: 'Vehicle Model', type: 'string' },
    { key: 'campaignName', label: 'Campaign', type: 'string' },
    { key: 'campaignInsertDate', label: 'Campaign Insert Date', type: 'date' },
    { key: 'eventNumber', label: 'Event Number', type: 'string' },
    { key: 'closeDate', label: 'Close Date', type: 'date' },
    { key: 'roAmount', label: 'RO Amount', type: 'currency' },
    { key: 'nOrU', label: 'N/U Status', type: 'string' },
  ];

  async analyzeFile(
    file: Express.Multer.File,
    dealershipId: string,
    userId: string,
    sheetName?: string
  ) {
    if (!file) throw new BadRequestException('No file provided');

    const ext = file.originalname.split('.').pop()?.toLowerCase();
    let detectedHeaders: string[] = [];
    let rawRows: Record<string, any>[] = [];
    let detectedMetadata: any = {};
    let sheets: string[] = [];
    let parseConfidence: 'high' | 'medium' | 'low' = 'high';
    let parseWarnings: string[] = [];

    if (ext === 'csv') {
      const parsed = CsvParser.parse(file.buffer);
      detectedHeaders = parsed.headers;
      rawRows = parsed.rows;
    } else if (ext === 'xlsx' || ext === 'xls') {
      const parsed = XlsxParser.parse(file.buffer, sheetName);
      detectedHeaders = parsed.headers;
      rawRows = parsed.rows;
      sheets = parsed.sheets;
    } else if (ext === 'pdf') {
      const parsed = await PdfParser.parse(file.buffer);
      detectedHeaders = parsed.headers;
      rawRows = parsed.rows;
      detectedMetadata = parsed.metadata;
      parseConfidence = parsed.confidence;
      parseWarnings = parsed.warnings;
    } else {
      throw new BadRequestException(`Unsupported file type: .${ext}. Supported: CSV, XLSX, XLS, PDF`);
    }

    // Auto-map detected headers to internal target fields
    const suggestedMappings: ColumnMappingDefinition[] = detectedHeaders.map((header) => {
      const norm = normalizeHeader(header);
      let targetField = '';
      let dataType: 'string' | 'number' | 'currency' | 'date' | 'boolean' = 'string';
      let transformation: 'none' | 'trim' | 'uppercase' | 'lowercase' | 'parse_currency' | 'parse_date' = 'none';

      // Sample column values to detect types
      const samples = rawRows.slice(0, 30).map((r) => r[header]);
      const autoType = detectDataType(samples);

      if (norm.includes('entity') || norm === 'entity_id' || norm === 'id') {
        targetField = 'externalEntityId';
        dataType = 'string';
      } else if (norm.includes('customer') || norm === 'name' || norm === 'client') {
        targetField = 'customerName';
        dataType = 'string';
      } else if (norm === 'year' || norm.includes('model_year')) {
        targetField = 'vehicle.year';
        dataType = 'number';
      } else if (norm.includes('make_model') || norm === 'make_model') {
        targetField = 'vehicle.model';
        dataType = 'string';
      } else if (norm === 'make') {
        targetField = 'vehicle.make';
        dataType = 'string';
      } else if (norm === 'model') {
        targetField = 'vehicle.model';
        dataType = 'string';
      } else if (norm === 'campaign' || norm.includes('campaign_name')) {
        targetField = 'campaignName';
        dataType = 'string';
      } else if (norm === 'insert' || norm.includes('insert_date')) {
        targetField = 'campaignInsertDate';
        dataType = 'date';
        transformation = 'parse_date';
      } else if (norm.includes('event') || norm === 'event_no' || norm === 'event_id') {
        targetField = 'eventNumber';
        dataType = 'string';
      } else if (norm.includes('close_date') || norm === 'closed_date') {
        targetField = 'closeDate';
        dataType = 'date';
        transformation = 'parse_date';
      } else if (norm.includes('ro_amount') || norm.includes('amount') || norm.includes('total')) {
        targetField = 'roAmount';
        dataType = 'currency';
        transformation = 'parse_currency';
      } else if (norm === 'n_u' || norm === 'nu') {
        targetField = 'nOrU';
        dataType = 'string';
      } else {
        targetField = `custom_${norm}`;
        dataType = autoType;
      }

      return {
        sourceColumn: header,
        targetField,
        dataType,
        transformation,
        isRequired: false,
      };
    });

    // Detect duplicate entity IDs or event numbers in source rows
    const entityMap = new Map<string, number>();
    const eventMap = new Map<string, number>();
    let duplicateCount = 0;

    for (const r of rawRows) {
      const eid = r['Entity ID'] || r['entity_id'] || r['Entity'] || r['ID'];
      const ev = r['Event#'] || r['Event #'] || r['Event'] || r['EventNo'];
      if (eid) {
        entityMap.set(String(eid), (entityMap.get(String(eid)) || 0) + 1);
        if (entityMap.get(String(eid))! > 1) duplicateCount++;
      }
      if (ev) {
        eventMap.set(String(ev), (eventMap.get(String(ev)) || 0) + 1);
        if (eventMap.get(String(ev))! > 1) duplicateCount++;
      }
    }

    // Create Import record in MongoDB
    const importDoc = await this.importModel.create({
      dealershipId: new Types.ObjectId(dealershipId),
      uploadedBy: new Types.ObjectId(userId),
      fileName: file.originalname,
      fileType: ext,
      fileSize: file.size,
      status: 'ANALYZING',
      totalRows: rawRows.length,
      detectedHeaders,
      sampleRows: rawRows.slice(0, 100),
      duplicateCount,
      mappingStatus: 'UNMAPPED',
      startedAt: new Date(),
    });

    await this.auditService.log({
      dealershipId,
      userId,
      entityType: 'Import',
      entityId: importDoc._id,
      action: 'IMPORT_STARTED',
      metadata: {
        fileName: file.originalname,
        fileSize: file.size,
        rows: rawRows.length,
      },
    });

    return {
      importId: importDoc._id,
      fileName: file.originalname,
      fileType: ext,
      fileSize: file.size,
      totalRows: rawRows.length,
      detectedHeaders,
      suggestedMappings,
      standardTargetFields: this.standardTargetFields,
      sampleRows: rawRows.slice(0, 50),
      allRows: rawRows, // returned so client can pass or preview effortlessly
      sheets,
      detectedMetadata,
      parseConfidence,
      parseWarnings,
      duplicateCount,
    };
  }

  generatePreviewRecords(
    rawRows: Record<string, any>[],
    mappings: ColumnMappingDefinition[],
    limit = 50
  ) {
    const previewList: any[] = [];
    const validationErrors: IValidationError[] = [];
    const entityCounts = new Map<string, number>();
    const eventCounts = new Map<string, number>();

    // Count keys for duplicates
    for (const row of rawRows) {
      const eid = this.extractMappedValue(row, mappings, 'externalEntityId');
      const ev = this.extractMappedValue(row, mappings, 'eventNumber');
      if (eid) entityCounts.set(String(eid), (entityCounts.get(String(eid)) || 0) + 1);
      if (ev) eventCounts.set(String(ev), (eventCounts.get(String(ev)) || 0) + 1);
    }

    const rowsToProcess = rawRows.slice(0, limit);

    rowsToProcess.forEach((rawRow, idx) => {
      const rowNum = idx + 1;
      const record: any = {
        _previewId: `preview-${rowNum}`,
        rowNumber: rowNum,
        vehicle: {},
        customFields: {},
        sourceData: rawRow,
        recordStatus: 'VALID',
        validationNotes: [],
      };

      for (const m of mappings) {
        const rawVal = rawRow[m.sourceColumn];
        const transformed = applyTransformation(rawVal, m.dataType, m.transformation);

        if (m.targetField === 'externalEntityId') {
          record.externalEntityId = transformed ? String(transformed) : undefined;
        } else if (m.targetField === 'customerName') {
          record.customerName = transformed ? String(transformed) : undefined;
        } else if (m.targetField === 'vehicle.year') {
          record.vehicle.year = transformed ? Number(transformed) : undefined;
        } else if (m.targetField === 'vehicle.make') {
          record.vehicle.make = transformed ? String(transformed) : undefined;
        } else if (m.targetField === 'vehicle.model') {
          record.vehicle.model = transformed ? String(transformed) : undefined;
        } else if (m.targetField === 'campaignName') {
          record.campaignName = transformed ? String(transformed) : undefined;
        } else if (m.targetField === 'campaignInsertDate') {
          record.campaignInsertDate = transformed;
        } else if (m.targetField === 'eventNumber') {
          record.eventNumber = transformed ? String(transformed) : undefined;
        } else if (m.targetField === 'closeDate') {
          record.closeDate = transformed;
        } else if (m.targetField === 'roAmount') {
          record.roAmount = transformed !== null ? Number(transformed) : undefined;
        } else if (m.targetField.startsWith('custom_')) {
          record.customFields[m.targetField.replace('custom_', '')] = transformed;
        } else {
          record.customFields[m.targetField] = transformed;
        }

        // Field level validation
        if (m.isRequired && (rawVal === undefined || rawVal === null || String(rawVal).trim() === '')) {
          record.recordStatus = 'ERROR';
          record.validationNotes.push(`Required field '${m.sourceColumn}' is missing`);
          validationErrors.push({
            row: rowNum,
            field: m.sourceColumn,
            message: 'Required field is empty',
            value: rawVal,
          });
        }
      }

      // Business validations
      if (record.closeDate && isNaN(new Date(record.closeDate).getTime())) {
        record.recordStatus = 'WARNING';
        record.validationNotes.push('Invalid Close Date format');
        validationErrors.push({
          row: rowNum,
          field: 'Close Date',
          message: 'Invalid date format',
          value: record.closeDate,
        });
      }

      if (record.roAmount !== undefined && (isNaN(record.roAmount) || record.roAmount < 0)) {
        record.recordStatus = 'WARNING';
        record.validationNotes.push('Invalid or negative RO Amount');
        validationErrors.push({
          row: rowNum,
          field: 'RO Amount',
          message: 'Invalid currency amount',
          value: record.roAmount,
        });
      }

      // Check duplicates
      if (record.externalEntityId && entityCounts.get(record.externalEntityId)! > 1) {
        if (record.recordStatus === 'VALID') record.recordStatus = 'WARNING';
        record.validationNotes.push(`Potential duplicate Entity ID (${record.externalEntityId})`);
      }
      if (record.eventNumber && eventCounts.get(record.eventNumber)! > 1) {
        if (record.recordStatus === 'VALID') record.recordStatus = 'WARNING';
        record.validationNotes.push(`Potential duplicate Event# (${record.eventNumber})`);
      }

      previewList.push(record);
    });

    return {
      previewRows: previewList,
      totalPreviewed: previewList.length,
      validationErrors,
    };
  }

  private extractMappedValue(
    row: Record<string, any>,
    mappings: ColumnMappingDefinition[],
    targetField: string
  ) {
    const mapping = mappings.find((m) => m.targetField === targetField);
    return mapping ? row[mapping.sourceColumn] : undefined;
  }

  async commitImport(params: {
    importId: string;
    dealershipId: string;
    userId: string;
    reportName: string;
    campaignName?: string;
    reportDateFrom?: string;
    reportDateTo?: string;
    rawRows: Record<string, any>[];
    columnMappings: ColumnMappingDefinition[];
    isNewVersion?: boolean;
    parentReportId?: string;
  }) {
    const {
      importId,
      dealershipId,
      userId,
      reportName,
      campaignName,
      reportDateFrom,
      reportDateTo,
      rawRows,
      columnMappings,
      isNewVersion,
      parentReportId,
    } = params;

    const importDoc = await this.importModel.findById(importId);
    if (!importDoc) throw new NotFoundException('Import session not found');

    // 1. Determine Report Version
    let version = 1;
    let actualParentId: Types.ObjectId | undefined;
    if (isNewVersion && parentReportId) {
      const parentReport = await this.reportModel.findById(parentReportId);
      if (parentReport) {
        actualParentId = parentReport._id;
        const latestSibling = await this.reportModel
          .findOne({ $or: [{ _id: actualParentId }, { parentReportId: actualParentId }] })
          .sort({ version: -1 });
        version = (latestSibling?.version || parentReport.version) + 1;
      }
    }

    // 2. Create Report document
    const reportDoc = await this.reportModel.create({
      dealershipId: new Types.ObjectId(dealershipId),
      uploadedBy: new Types.ObjectId(userId),
      name: reportName || importDoc.fileName,
      sourceFileName: importDoc.fileName,
      sourceFileType: importDoc.fileType,
      sourceFileSize: importDoc.fileSize,
      campaignName: campaignName || 'HY Closed RO',
      reportType: 'DealerSocket Closed RO',
      reportDateFrom: reportDateFrom ? new Date(reportDateFrom) : undefined,
      reportDateTo: reportDateTo ? new Date(reportDateTo) : undefined,
      recordCount: rawRows.length,
      status: 'IMPORTED',
      columnMappings,
      originalHeaders: importDoc.detectedHeaders,
      normalizedHeaders: importDoc.detectedHeaders.map((h) => normalizeHeader(h)),
      importId: importDoc._id,
      version,
      parentReportId: actualParentId,
    });

    // 3. Transform and Prepare Bulk Insert Records
    const recordsToInsert: any[] = [];
    let successfulRows = 0;
    let failedRows = 0;
    const validationErrors: IValidationError[] = [];

    rawRows.forEach((rawRow, idx) => {
      const rowNum = idx + 1;
      try {
        const record: any = {
          reportId: reportDoc._id,
          dealershipId: new Types.ObjectId(dealershipId),
          vehicle: {},
          customFields: {},
          sourceData: rawRow, // CRITICAL: Preserves original unedited row
          recordStatus: 'VALID',
          validationNotes: [],
        };

        for (const m of columnMappings) {
          const rawVal = rawRow[m.sourceColumn];
          const transformed = applyTransformation(rawVal, m.dataType, m.transformation);

          if (m.targetField === 'externalEntityId') {
            record.externalEntityId = transformed ? String(transformed) : undefined;
          } else if (m.targetField === 'customerName') {
            record.customerName = transformed ? String(transformed) : undefined;
          } else if (m.targetField === 'vehicle.year') {
            record.vehicle.year = transformed ? Number(transformed) : undefined;
          } else if (m.targetField === 'vehicle.make') {
            record.vehicle.make = transformed ? String(transformed) : undefined;
          } else if (m.targetField === 'vehicle.model') {
            record.vehicle.model = transformed ? String(transformed) : undefined;
          } else if (m.targetField === 'campaignName') {
            record.campaignName = transformed ? String(transformed) : undefined;
          } else if (m.targetField === 'campaignInsertDate') {
            record.campaignInsertDate = transformed;
          } else if (m.targetField === 'eventNumber') {
            record.eventNumber = transformed ? String(transformed) : undefined;
          } else if (m.targetField === 'closeDate') {
            record.closeDate = transformed;
          } else if (m.targetField === 'roAmount') {
            record.roAmount = transformed !== null ? Number(transformed) : undefined;
          } else if (m.targetField.startsWith('custom_')) {
            record.customFields[m.targetField.replace('custom_', '')] = transformed;
          } else {
            record.customFields[m.targetField] = transformed;
          }
        }

        // Validate closeDate & roAmount
        if (record.closeDate && isNaN(new Date(record.closeDate).getTime())) {
          record.recordStatus = 'WARNING';
          record.validationNotes.push('Invalid Close Date format');
        }
        if (record.roAmount !== undefined && (isNaN(record.roAmount) || record.roAmount < 0)) {
          record.recordStatus = 'WARNING';
          record.validationNotes.push('Invalid RO Amount');
        }

        recordsToInsert.push(record);
        successfulRows++;
      } catch (err: any) {
        failedRows++;
        validationErrors.push({
          row: rowNum,
          field: 'General',
          message: err.message || 'Row processing failure',
        });
      }
    });

    // 4. Bulk insert into MongoDB using insertMany
    if (recordsToInsert.length > 0) {
      await this.reportRecordModel.insertMany(recordsToInsert, { ordered: false });
    }

    // 5. Update Import status
    importDoc.status = 'COMPLETED';
    importDoc.reportId = reportDoc._id;
    importDoc.successfulRows = successfulRows;
    importDoc.failedRows = failedRows;
    importDoc.validationErrors = validationErrors;
    importDoc.completedAt = new Date();
    await importDoc.save();

    // 6. Save or update reusable column mappings for this dealership
    for (const m of columnMappings) {
      if (m.sourceColumn && m.targetField) {
        await this.mappingModel.findOneAndUpdate(
          { dealershipId: new Types.ObjectId(dealershipId), sourceColumn: m.sourceColumn },
          {
            dealershipId: new Types.ObjectId(dealershipId),
            sourceColumn: m.sourceColumn,
            targetField: m.targetField,
            dataType: m.dataType,
            transformation: m.transformation || 'none',
            isRequired: m.isRequired || false,
            createdBy: new Types.ObjectId(userId),
          },
          { upsert: true }
        );
      }
    }

    // 7. Log Audits
    await this.auditService.log({
      dealershipId,
      userId,
      entityType: 'Report',
      entityId: reportDoc._id,
      action: 'REPORT_UPLOADED',
      after: {
        reportId: reportDoc._id,
        name: reportDoc.name,
        recordsCount: successfulRows,
        version,
      },
    });

    await this.auditService.log({
      dealershipId,
      userId,
      entityType: 'Import',
      entityId: importDoc._id,
      action: 'IMPORT_COMPLETED',
      after: {
        successfulRows,
        failedRows,
        reportId: reportDoc._id,
      },
    });

    return {
      reportId: reportDoc._id,
      importId: importDoc._id,
      reportName: reportDoc.name,
      version: reportDoc.version,
      successfulRows,
      failedRows,
      totalRows: rawRows.length,
      status: 'COMPLETED',
    };
  }

  async getImports(query: { dealershipId?: string; page?: number; limit?: number }) {
    const filter: any = {};
    if (query.dealershipId) filter.dealershipId = new Types.ObjectId(query.dealershipId);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.importModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('uploadedBy', 'name email')
        .populate('reportId', 'name version recordCount')
        .lean(),
      this.importModel.countDocuments(filter),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getImportById(id: string) {
    const item = await this.importModel
      .findById(id)
      .populate('uploadedBy', 'name email')
      .populate('reportId', 'name version recordCount')
      .lean();
    if (!item) throw new NotFoundException('Import record not found');
    return item;
  }
}
