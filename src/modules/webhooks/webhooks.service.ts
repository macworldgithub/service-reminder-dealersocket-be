import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IDealership } from '../../models/Dealership.model';
import { IReport } from '../../models/Report.model';
import { IReportRecord } from '../../models/ReportRecord.model';
import { IImport } from '../../models/Import.model';
import { IWebhookLog } from '../../models/WebhookLog.model';
import { IUser } from '../../models/User.model';
import { PdfParser } from '../../parsers/pdf.parser';
import { CsvParser } from '../../parsers/csv.parser';
import { XlsxParser } from '../../parsers/xlsx.parser';
import { AuditService } from '../audit/audit.service';
import {
  normalizeHeader,
  parseCurrency,
  parseDate,
  detectDataType,
} from '../../utils/dataTransformation';

export const DEFAULT_WEBHOOK_API_KEY = 'ds_live_sk_9a8f27c3e104b46298fa';

export const STORE_API_KEYS: Record<string, string> = {
  'BMG-01': 'ds_live_sk_bmg_4b2e81a9c3d0f51728ea',
  'CBH-01': 'ds_live_sk_cbh_7d3a91e5f2b8c40619db',
  'DNM-01': 'ds_live_sk_dnm_6c1f80d4e9a7b39508ca',
  'SMH-01': 'ds_live_sk_9a8f27c3e104b46298fa',
  'SMK-01': 'ds_live_sk_smk_5a0e79c3d8f6a28497b9',
  'SKI-01': 'ds_live_sk_ski_3e9d68b2c7e5f17386a8',
};

@Injectable()
export class WebhooksService {
  constructor(
    @InjectModel('Dealership') private dealershipModel: Model<IDealership>,
    @InjectModel('Report') private reportModel: Model<IReport>,
    @InjectModel('ReportRecord') private reportRecordModel: Model<IReportRecord>,
    @InjectModel('Import') private importModel: Model<IImport>,
    @InjectModel('WebhookLog') private webhookLogModel: Model<IWebhookLog>,
    @InjectModel('User') private userModel: Model<IUser>,
    private auditService: AuditService
  ) {}

  /**
   * Resolve dealership from store identifier (ObjectId, code, or name)
   */
  async resolveDealership(storeIdentifier?: string): Promise<IDealership | null> {
    if (!storeIdentifier) return null;
    const clean = storeIdentifier.trim();
    if (!clean) return null;

    if (Types.ObjectId.isValid(clean)) {
      const found = await this.dealershipModel.findById(clean).lean();
      if (found) return found as unknown as IDealership;
    }

    const byCodeOrName = await this.dealershipModel
      .findOne({
        $or: [
          { code: clean.toUpperCase() },
          { name: new RegExp(`^${clean}$`, 'i') },
        ],
      })
      .lean();

    return byCodeOrName ? (byCodeOrName as unknown as IDealership) : null;
  }

  /**
   * Validate incoming API key and resolve the target dealership.
   * Multi-store resolution hierarchy:
   * 1. Explicit store parameter (route :storeCode, query ?store=..., header x-store-code, or body storeCode)
   * 2. Store-specific API Key matching in database or SYSTEM_STORES mapping
   * 3. Intelligent auto-detection from filename or campaign name keywords
   * 4. Backwards compatibility fallback to South Morang Hyundai (SMH-01)
   */
  async authenticateKey(
    apiKey?: string,
    explicitStore?: string,
    fileName?: string,
    campaignName?: string
  ): Promise<IDealership> {
    const key = (apiKey || '').trim().replace(/^Bearer\s+/i, '');
    if (!key) {
      throw new UnauthorizedException(
        'Missing Webhook API Key. Provide it via header x-api-key, Authorization Bearer, or query ?apiKey=...'
      );
    }

    // 1. If explicit store was specified
    if (explicitStore && explicitStore.trim()) {
      const targetStore = await this.resolveDealership(explicitStore);
      if (targetStore) {
        const expectedKey =
          (targetStore as any).settings?.webhookApiKey || STORE_API_KEYS[targetStore.code];
        const isMasterKey = key === DEFAULT_WEBHOOK_API_KEY;
        const isKnownSystemKey = Object.values(STORE_API_KEYS).includes(key);

        if (key === expectedKey || isMasterKey || isKnownSystemKey) {
          return targetStore;
        } else {
          throw new UnauthorizedException(
            `API Key provided is not authorized for store "${targetStore.name}" (${targetStore.code}).`
          );
        }
      }
    }

    // 2. Resolve store by API Key directly (database lookup or static store mapping)
    let dealership = await this.dealershipModel
      .findOne({ 'settings.webhookApiKey': key })
      .lean();

    if (!dealership) {
      for (const [code, storeKey] of Object.entries(STORE_API_KEYS)) {
        if (key === storeKey) {
          dealership = await this.dealershipModel.findOne({ code }).lean();
          break;
        }
      }
    }

    if (dealership) {
      return dealership as unknown as IDealership;
    }

    // 3. If master key or valid prefix was provided, try auto-detecting store from filename / campaign name
    const isMasterOrValidPrefix = key === DEFAULT_WEBHOOK_API_KEY || key.startsWith('ds_live_sk_');
    if (isMasterOrValidPrefix) {
      const text = `${fileName || ''} ${campaignName || ''}`.toLowerCase();
      let detectedCode: string | null = null;

      if (text.includes('berwick') || text.includes('bmg')) {
        detectedCode = 'BMG-01';
      } else if (text.includes('cranbourne') || text.includes('cbh')) {
        detectedCode = 'CBH-01';
      } else if (text.includes('dandenong') || text.includes('dnm')) {
        detectedCode = 'DNM-01';
      } else if (text.includes('southland') || text.includes('ski')) {
        detectedCode = 'SKI-01';
      } else if (
        (text.includes('morang') && text.includes('kia')) ||
        text.includes('smk')
      ) {
        detectedCode = 'SMK-01';
      } else if (
        (text.includes('morang') && (text.includes('hyundai') || text.includes('hy'))) ||
        text.includes('smh')
      ) {
        detectedCode = 'SMH-01';
      }

      if (detectedCode) {
        dealership = await this.dealershipModel.findOne({ code: detectedCode }).lean();
        if (dealership) {
          return dealership as unknown as IDealership;
        }
      }

      // 4. Default fallback to South Morang Hyundai for existing integrations
      dealership = await this.dealershipModel.findOne({ code: 'SMH-01' }).lean();
      if (!dealership) {
        dealership = await this.dealershipModel.findOne({ status: 'ACTIVE' }).lean();
      }
      if (dealership) {
        return dealership as unknown as IDealership;
      }
    }

    throw new UnauthorizedException('Invalid Webhook API Key.');
  }

  /**
   * Returns current webhook configuration, store-specific endpoint URLs, and example snippets
   */
  async getConfig(dealershipIdOrCode?: string) {
    let dealership = await this.resolveDealership(dealershipIdOrCode);

    if (!dealership) {
      dealership = (await this.dealershipModel.findOne({ code: 'SMH-01' }).lean()) as any;
      if (!dealership) {
        dealership = (await this.dealershipModel.findOne({ status: 'ACTIVE' }).lean()) as any;
      }
    }

    const code = dealership?.code || 'SMH-01';
    const name = dealership?.name || 'South Morang Hyundai';
    const currentKey =
      (dealership as any)?.settings?.webhookApiKey || STORE_API_KEYS[code] || DEFAULT_WEBHOOK_API_KEY;

    const allStores = await this.dealershipModel.find({ status: 'ACTIVE' }).sort({ name: 1 }).lean();

    return {
      dealershipId: dealership?._id,
      dealershipName: name,
      dealershipCode: code,
      webhookUrl: `/api/webhooks/ingest?store=${code}`,
      storeSpecificRouteUrl: `/api/webhooks/${code}/ingest`,
      fullWebhookUrl: `http://localhost:7000/api/webhooks/ingest?store=${code}`,
      fullStoreSpecificRouteUrl: `http://localhost:7000/api/webhooks/${code}/ingest`,
      apiKey: currentKey,
      supportedFormats: ['PDF (.pdf)', 'CSV (.csv)', 'Excel (.xlsx, .xls)', 'JSON Payload'],
      status: 'ACTIVE',
      usageExampleCurl: `curl -X POST "http://localhost:7000/api/webhooks/ingest?store=${code}" \\\n  -H "x-api-key: ${currentKey}" \\\n  -F "file=@${code}_Closed_RO.pdf"`,
      usageExampleCurlDirect: `curl -X POST "http://localhost:7000/api/webhooks/${code}/ingest" \\\n  -H "x-api-key: ${currentKey}" \\\n  -F "file=@${code}_Closed_RO.pdf"`,
      allStores: allStores.map((s) => ({
        id: s._id,
        name: s.name,
        code: s.code,
        apiKey: (s.settings as any)?.webhookApiKey || STORE_API_KEYS[s.code] || DEFAULT_WEBHOOK_API_KEY,
        webhookUrl: `/api/webhooks/ingest?store=${s.code}`,
        storeSpecificRouteUrl: `/api/webhooks/${s.code}/ingest`,
      })),
    };
  }

  /**
   * Health ping for webhook endpoint with store validation
   */
  async testPing(apiKey?: string, sourceIp?: string, explicitStore?: string) {
    const dealership = await this.authenticateKey(apiKey, explicitStore);

    await this.webhookLogModel.create({
      dealershipId: dealership._id,
      eventType: 'PING',
      sourceIp,
      status: 'PING',
      responseStatus: 200,
      message: `Webhook ping check successful for ${dealership.name} (${dealership.code})`,
      payloadSummary: {
        dealership: dealership.name,
        code: dealership.code,
        timestamp: new Date(),
      },
    });

    return {
      success: true,
      message: `DealerSocket Inbound Webhook is online, authenticated, and ready to receive PDF reports for ${dealership.name} (${dealership.code}).`,
      dealership: {
        id: dealership._id,
        name: dealership.name,
        code: dealership.code,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Fetch recent webhook delivery logs filtered by dealership
   */
  async getLogs(dealershipIdOrCode?: string, limit = 20) {
    const filter: any = { isWebhook: true };
    const target = (dealershipIdOrCode || '').trim();

    if (target && target !== 'all') {
      const resolved = await this.resolveDealership(target);
      if (resolved) {
        filter.dealershipId = resolved._id;
      } else if (Types.ObjectId.isValid(target)) {
        filter.dealershipId = new Types.ObjectId(target);
      }
    }

    return this.webhookLogModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('dealershipId', 'name code')
      .populate('reportId', 'name recordCount totalRevenue')
      .lean();
  }

  /**
   * Process incoming file (PDF, CSV, XLSX) or base64 received via webhook
   */
  async ingestReport(params: {
    fileBuffer: Buffer;
    fileName: string;
    dealership: IDealership;
    campaignName?: string;
    sourceIp?: string;
  }) {
    const { fileBuffer, fileName, dealership, campaignName, sourceIp } = params;

    const ext = fileName.split('.').pop()?.toLowerCase() || 'pdf';
    let detectedHeaders: string[] = [];
    let rawRows: Record<string, any>[] = [];
    let detectedMetadata: any = {};

    try {
      if (ext === 'pdf') {
        const parsed = await PdfParser.parse(fileBuffer);
        detectedHeaders = parsed.headers;
        rawRows = parsed.rows;
        detectedMetadata = parsed.metadata || {};
      } else if (ext === 'csv') {
        const parsed = CsvParser.parse(fileBuffer);
        detectedHeaders = parsed.headers;
        rawRows = parsed.rows;
      } else if (ext === 'xlsx' || ext === 'xls') {
        const parsed = XlsxParser.parse(fileBuffer);
        detectedHeaders = parsed.headers;
        rawRows = parsed.rows;
      } else {
        throw new BadRequestException(
          `Unsupported file format: .${ext}. The webhook accepts PDF, CSV, and Excel reports.`
        );
      }

      if (!rawRows || rawRows.length === 0) {
        throw new BadRequestException('No records detected in received document.');
      }

      // Assign system user as uploader
      let systemUser = await this.userModel.findOne({ email: 'admin@dealersocket.com' }).lean();
      if (!systemUser) {
        systemUser = await this.userModel.findOne({ role: 'ADMIN' }).lean();
      }
      const uploaderId = systemUser?._id || new Types.ObjectId();

      // Determine date bounds
      let dateFrom = detectedMetadata.reportDateFrom;
      let dateTo = detectedMetadata.reportDateTo;
      let dateRangeLabel = detectedMetadata.reportDateRange;

      if (!dateFrom || !dateTo) {
        const rowDates = rawRows
          .map((r) => r['Close Date'] || r['close_date'] || r['closeDate'] || r['Campaign Insert'])
          .filter(Boolean)
          .map((d) => new Date(d))
          .filter((d) => !isNaN(d.getTime()))
          .sort((a, b) => a.getTime() - b.getTime());

        if (rowDates.length > 0) {
          if (!dateFrom) dateFrom = rowDates[0];
          if (!dateTo) dateTo = rowDates[rowDates.length - 1];
        }
      }

      if (!dateRangeLabel && dateFrom && dateTo) {
        const fStr = new Date(dateFrom).toLocaleDateString('en-US', {
          month: 'numeric',
          day: 'numeric',
          year: 'numeric',
        });
        const tStr = new Date(dateTo).toLocaleDateString('en-US', {
          month: 'numeric',
          day: 'numeric',
          year: 'numeric',
        });
        dateRangeLabel = `${fStr} - ${tStr}`;
      }

      // Format report title reflecting today's ingestion date and store identity
      const todayFormatted = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const fallbackTitle = `${dealership.name} Closed RO`;
      const baseTitle =
        detectedMetadata.campaignName || campaignName || fallbackTitle;
      const reportName = dateRangeLabel
        ? `${baseTitle} (${dateRangeLabel}) [Webhook]`
        : `${baseTitle} (${todayFormatted}) [Webhook]`;

      // 1. Create Import Document
      const importDoc = await this.importModel.create({
        dealershipId: dealership._id,
        uploadedBy: uploaderId,
        fileName,
        fileType: ext,
        fileSize: fileBuffer.length,
        detectedHeaders,
        totalRows: rawRows.length,
        status: 'COMPLETED',
        completedAt: new Date(),
      });

      // 2. Generate column mappings
      const columnMappings = this.generateDefaultMappings(detectedHeaders, rawRows);

      // 3. Create Report Document
      const reportDoc = await this.reportModel.create({
        dealershipId: dealership._id,
        uploadedBy: uploaderId,
        name: reportName,
        sourceFileName: fileName,
        sourceFileType: ext,
        sourceFileSize: fileBuffer.length,
        campaignName: detectedMetadata.campaignName || campaignName || fallbackTitle,
        reportType: 'DealerSocket Closed RO',
        reportDateFrom: dateFrom ? new Date(dateFrom) : new Date(),
        reportDateTo: dateTo ? new Date(dateTo) : new Date(),
        recordCount: rawRows.length,
        status: 'IMPORTED',
        columnMappings,
        originalHeaders: detectedHeaders,
        normalizedHeaders: detectedHeaders.map((h) => normalizeHeader(h)),
        importId: importDoc._id,
        version: 1,
        createdAt: new Date(),
      });

      // 4. Transform and Insert Report Records
      let totalRoRevenue = 0;
      const recordsToInsert = rawRows.map((rawRow) => {
        const record: any = {
          reportId: reportDoc._id,
          dealershipId: dealership._id,
          vehicle: {},
          customFields: {},
          sourceData: rawRow,
          recordStatus: 'VALID',
          validationNotes: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        columnMappings.forEach((map) => {
          const rawVal = rawRow[map.sourceColumn];
          if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
            if (map.targetField.startsWith('vehicle.')) {
              const field = map.targetField.replace('vehicle.', '');
              if (field === 'year') {
                const yr = parseInt(String(rawVal).replace(/\D/g, ''), 10);
                if (!isNaN(yr)) record.vehicle.year = yr;
              } else {
                record.vehicle[field] = String(rawVal).trim();
              }
            } else if (map.targetField === 'roAmount') {
              const amt = parseCurrency(rawVal);
              if (amt !== undefined) {
                record.roAmount = amt;
                totalRoRevenue += amt;
              }
            } else if (map.targetField === 'closeDate') {
              const d = parseDate(rawVal);
              if (d) record.closeDate = d;
            } else if (map.targetField === 'campaignInsertDate') {
              const d = parseDate(rawVal);
              if (d) record.campaignInsertDate = d;
            } else if (map.targetField === 'nOrU') {
              record.nOrU = String(rawVal).trim();
              record.customFields.nOrU = String(rawVal).trim();
            } else {
              record[map.targetField] = String(rawVal).trim();
            }
          }
        });

        // Fallbacks for key columns if not mapped
        if (!record.customerName) {
          record.customerName = rawRow['Customer Name'] || rawRow['Customer'] || rawRow['Name'];
        }
        if (!record.externalEntityId) {
          record.externalEntityId = rawRow['Entity ID'] || rawRow['Entity'] || rawRow['ID'];
        }
        if (!record.eventNumber) {
          record.eventNumber = rawRow['Event#'] || rawRow['Event #'] || rawRow['Event'];
        }
        if (record.roAmount === undefined && rawRow['RO Amount']) {
          const amt = parseCurrency(rawRow['RO Amount']);
          if (amt !== undefined) {
            record.roAmount = amt;
            totalRoRevenue += amt;
          }
        }
        if (!record.closeDate && rawRow['Close Date']) {
          const d = parseDate(rawRow['Close Date']);
          if (d) record.closeDate = d;
        }

        return record;
      });

      await this.reportRecordModel.insertMany(recordsToInsert, { ordered: false });

      const finalTotalRevenue = Math.round(totalRoRevenue * 100) / 100;

      // 5. Log Webhook Delivery
      await this.webhookLogModel.create({
        dealershipId: dealership._id,
        eventType: 'REPORT_INGEST',
        sourceIp,
        fileName,
        fileType: ext,
        fileSize: fileBuffer.length,
        reportId: reportDoc._id,
        recordCount: rawRows.length,
        totalRevenue: finalTotalRevenue,
        status: 'SUCCESS',
        responseStatus: 201,
        message: `Successfully ingested report for ${dealership.name} (${dealership.code}) with ${rawRows.length} records and $${finalTotalRevenue.toLocaleString()} tracked revenue.`,
        payloadSummary: {
          dealership: dealership.name,
          storeCode: dealership.code,
          reportName,
          dateRange: dateRangeLabel,
          rows: rawRows.length,
        },
      });

      // 6. Audit Trail
      await this.auditService.log({
        dealershipId: dealership._id,
        userId: uploaderId,
        entityType: 'Report',
        entityId: reportDoc._id,
        action: 'REPORT_UPLOADED',
        after: {
          name: reportName,
          dealership: dealership.name,
          storeCode: dealership.code,
          recordCount: rawRows.length,
          source: 'WEBHOOK_INBOUND_PIPELINE',
          fileName,
        },
      });

      return {
        success: true,
        message: `DealerSocket report received and successfully ingested for ${dealership.name} (${dealership.code}).`,
        data: {
          reportId: reportDoc._id,
          reportName,
          dealershipId: dealership._id,
          dealershipName: dealership.name,
          dealershipCode: dealership.code,
          sourceFileName: fileName,
          fileType: ext.toUpperCase(),
          recordCount: rawRows.length,
          totalRevenue: finalTotalRevenue,
          averageRoAmount: rawRows.length > 0 ? Math.round((finalTotalRevenue / rawRows.length) * 100) / 100 : 0,
          reportDateCoverage: dateRangeLabel || todayFormatted,
          ingestedAt: new Date(),
          status: 'IMPORTED',
          viewUrl: `/reports/${reportDoc._id}`,
        },
      };
    } catch (err: any) {
      // Log failed delivery
      await this.webhookLogModel.create({
        dealershipId: dealership._id,
        eventType: 'REPORT_INGEST',
        sourceIp,
        fileName,
        fileType: ext,
        fileSize: fileBuffer.length,
        status: 'FAILED',
        responseStatus: err.status || 400,
        message: err.message || 'Webhook ingestion failed',
      });
      throw err;
    }
  }

  private generateDefaultMappings(headers: string[], sampleRows: any[]) {
    const mappings: any[] = [];
    const usedTargets = new Set<string>();

    headers.forEach((h) => {
      const norm = normalizeHeader(h);
      let target: string | null = null;

      if (norm.includes('entity') || norm === 'id') target = 'externalEntityId';
      else if (norm.includes('customer') || norm === 'name') target = 'customerName';
      else if (norm.includes('email')) target = 'customerEmail';
      else if (norm.includes('phone') || norm.includes('mobile')) target = 'customerPhone';
      else if (norm === 'year' || norm.includes('model_year')) target = 'vehicle.year';
      else if (norm.includes('make') && !norm.includes('model')) target = 'vehicle.make';
      else if (norm.includes('model')) target = 'vehicle.model';
      else if (norm.includes('campaign_insert') || norm.includes('insert_date')) target = 'campaignInsertDate';
      else if (norm.includes('campaign') || norm.includes('campaign_name')) target = 'campaignName';
      else if (norm.includes('event')) target = 'eventNumber';
      else if (norm.includes('close_date') || norm.includes('closed_date')) target = 'closeDate';
      else if (norm.includes('ro_amount') || norm.includes('amount') || norm.includes('ro_total')) target = 'roAmount';
      else if (norm === 'n_u' || norm === 'nu' || norm.includes('new_used')) target = 'nOrU';

      if (target && !usedTargets.has(target)) {
        usedTargets.add(target);
        mappings.push({
          sourceColumn: h,
          targetField: target,
          dataType: detectDataType(sampleRows.map((r) => r[h])),
        });
      }
    });

    return mappings;
  }
}
