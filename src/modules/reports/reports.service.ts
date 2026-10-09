import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type * as XLSXType from 'xlsx';
import { IReport } from '../../models/Report.model';
import { IReportRecord } from '../../models/ReportRecord.model';
import { ITemplate } from '../../models/Template.model';
import { AuditService } from '../audit/audit.service';
import { PdfGenerator } from '../../parsers/pdf.generator';

function parseUtcStartOfDay(dateStr: string): Date {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0));
  }
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function parseUtcEndOfDay(dateStr: string): Date {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59, 999));
  }
  const d = new Date(dateStr);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel('Report') private reportModel: Model<IReport>,
    @InjectModel('ReportRecord') private reportRecordModel: Model<IReportRecord>,
    @InjectModel('Template') private templateModel: Model<ITemplate>,
    private auditService: AuditService
  ) {}

  async findAll(query: {
    dealershipId?: string;
    campaignName?: string;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: any[]; meta: any }> {
    const filter: any = {};
    if (query.dealershipId) filter.dealershipId = new Types.ObjectId(query.dealershipId);
    if (query.campaignName) filter.campaignName = query.campaignName;
    if (query.status) filter.status = query.status;

    if (query.dateFrom || query.dateTo) {
      const fromDate = query.dateFrom ? parseUtcStartOfDay(query.dateFrom) : undefined;
      const toDate = query.dateTo ? parseUtcEndOfDay(query.dateTo) : undefined;
      const isSingleDay = Boolean(query.dateFrom && query.dateTo && query.dateFrom === query.dateTo);

      if (fromDate && toDate) {
        if (isSingleDay) {
          // For single day presets (e.g. Today or Yesterday):
          // Match if coverage period includes that day, or if uploaded on that day
          filter.$or = [
            {
              reportDateFrom: { $lte: toDate },
              reportDateTo: { $gte: fromDate },
            },
            {
              createdAt: { $gte: fromDate, $lte: toDate },
            },
          ];
        } else {
          // For macro periods (Quarters, Years, date spans):
          // Match reports whose service coverage period falls in this range.
          // Only fallback to createdAt if report has no coverage period specified.
          filter.$or = [
            {
              reportDateFrom: { $lte: toDate },
              reportDateTo: { $gte: fromDate },
            },
            {
              reportDateFrom: { $exists: false },
              createdAt: { $gte: fromDate, $lte: toDate },
            },
            {
              reportDateFrom: null,
              createdAt: { $gte: fromDate, $lte: toDate },
            },
          ];
        }
      } else if (fromDate) {
        filter.$or = [
          { reportDateTo: { $gte: fromDate } },
          { reportDateTo: { $exists: false }, createdAt: { $gte: fromDate } },
          { reportDateTo: null, createdAt: { $gte: fromDate } },
        ];
      } else if (toDate) {
        filter.$or = [
          { reportDateFrom: { $lte: toDate } },
          { reportDateFrom: { $exists: false }, createdAt: { $lte: toDate } },
          { reportDateFrom: null, createdAt: { $lte: toDate } },
        ];
      }
    }

    if (query.search) {
      const searchCondition = [
        { name: { $regex: query.search, $options: 'i' } },
        { campaignName: { $regex: query.search, $options: 'i' } },
        { sourceFileName: { $regex: query.search, $options: 'i' } },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchCondition }];
        delete filter.$or;
      } else {
        filter.$or = searchCondition;
      }
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    // Run list, count and id lookup in parallel (single DB round-trip window)
    const [items, total, allFilteredReportIds] = await Promise.all([
      this.reportModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('uploadedBy', 'name email')
        .populate('dealershipId', 'name code')
        .lean(),
      this.reportModel.countDocuments(filter),
      this.reportModel.find(filter).select('_id').lean(),
    ]);

    // Attach totalRevenue and avgRoAmount to each report item, and compute
    // total tracked revenue across all filtered reports — both in parallel
    const reportIds = items.map((r) => r._id);
    const allIds = allFilteredReportIds.map((r) => r._id);
    const [revenueAggr, overallRevenueAggr] = await Promise.all([
      reportIds.length
        ? this.reportRecordModel.aggregate([
            { $match: { reportId: { $in: reportIds } } },
            {
              $group: {
                _id: '$reportId',
                totalRevenue: { $sum: '$roAmount' },
                avgRoAmount: { $avg: '$roAmount' },
              },
            },
          ])
        : Promise.resolve([] as any[]),
      allIds.length
        ? this.reportRecordModel.aggregate([
            { $match: { reportId: { $in: allIds } } },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: '$roAmount' },
              },
            },
          ])
        : Promise.resolve([] as any[]),
    ]);

    const revMap = new Map<string, { totalRevenue: number; avgRoAmount: number }>();
    for (const r of revenueAggr) {
      revMap.set(String(r._id), {
        totalRevenue: Math.round((r.totalRevenue || 0) * 100) / 100,
        avgRoAmount: Math.round((r.avgRoAmount || 0) * 100) / 100,
      });
    }

    const enrichedItems = items.map((item) => ({
      ...item,
      totalRevenue: revMap.get(String(item._id))?.totalRevenue || 0,
      avgRoAmount: revMap.get(String(item._id))?.avgRoAmount || 0,
    }));

    const totalTrackedRevenue = Math.round((overallRevenueAggr[0]?.totalRevenue || 0) * 100) / 100;

    return {
      items: enrichedItems,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        totalTrackedRevenue,
      },
    };
  }

  async findById(id: string) {
    const report = await this.reportModel
      .findById(id)
      .populate('uploadedBy', 'name email role')
      .populate('dealershipId', 'name code timezone')
      .lean();

    if (!report) throw new NotFoundException('Report not found');

    // Fetch related versions (parent or children)
    const rootId = report.parentReportId || report._id;
    const versions = await this.reportModel
      .find({
        $or: [{ _id: rootId }, { parentReportId: rootId }],
      })
      .select('_id name version recordCount createdAt status')
      .sort({ version: 1 })
      .lean();

    // Calculate live summary stats
    const [totalValid, totalWarnings, totalErrors, roSum] = await Promise.all([
      this.reportRecordModel.countDocuments({ reportId: report._id, recordStatus: 'VALID' }),
      this.reportRecordModel.countDocuments({ reportId: report._id, recordStatus: 'WARNING' }),
      this.reportRecordModel.countDocuments({ reportId: report._id, recordStatus: 'ERROR' }),
      this.reportRecordModel.aggregate([
        { $match: { reportId: new Types.ObjectId(id) } },
        { $group: { _id: null, totalAmount: { $sum: '$roAmount' }, avgAmount: { $avg: '$roAmount' } } },
      ]),
    ]);

    const stats = {
      recordCount: report.recordCount,
      validRecords: totalValid,
      warningRecords: totalWarnings,
      errorRecords: totalErrors,
      totalRoRevenue: Math.round((roSum[0]?.totalAmount || 0) * 100) / 100,
      avgRoAmount: Math.round((roSum[0]?.avgAmount || 0) * 100) / 100,
    };

    return {
      report,
      versions,
      stats,
    };
  }

  async getRevenueLookup(id: string, query: { dateFrom?: string; dateTo?: string }): Promise<any> {
    const report = await this.reportModel.findById(id).lean();
    if (!report) throw new NotFoundException('Report not found');

    const reportObjectId = new Types.ObjectId(id);

    // 1. Overall stats for this report
    const overallAgg = await this.reportRecordModel.aggregate([
      { $match: { reportId: reportObjectId } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$roAmount' },
          totalRecords: { $sum: 1 },
          minDate: { $min: '$closeDate' },
          maxDate: { $max: '$closeDate' },
          overallAvgRo: { $avg: '$roAmount' },
        },
      },
    ]);

    const totalRevenue = Math.round((overallAgg[0]?.totalRevenue || 0) * 100) / 100;
    const totalRecords = overallAgg[0]?.totalRecords || 0;
    const minCloseDate = overallAgg[0]?.minDate || null;
    const maxCloseDate = overallAgg[0]?.maxDate || null;
    const overallAvgRo = Math.round((overallAgg[0]?.overallAvgRo || 0) * 100) / 100;

    // 2. Filtered stats
    const matchFilter: any = { reportId: reportObjectId };
    if (query.dateFrom || query.dateTo) {
      matchFilter.closeDate = {};
      if (query.dateFrom) {
        matchFilter.closeDate.$gte = parseUtcStartOfDay(query.dateFrom);
      }
      if (query.dateTo) {
        matchFilter.closeDate.$lte = parseUtcEndOfDay(query.dateTo);
      }
    }

    const filteredAgg = await this.reportRecordModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          filteredRevenue: { $sum: '$roAmount' },
          filteredCount: { $sum: 1 },
          filteredAvgRoAmount: { $avg: '$roAmount' },
          minRoAmount: { $min: '$roAmount' },
          maxRoAmount: { $max: '$roAmount' },
        },
      },
    ]);

    const filteredRevenue = Math.round((filteredAgg[0]?.filteredRevenue || 0) * 100) / 100;
    const filteredCount = filteredAgg[0]?.filteredCount || 0;
    const filteredAvgRoAmount = Math.round((filteredAgg[0]?.filteredAvgRoAmount || 0) * 100) / 100;
    const minRoAmount = filteredAgg[0]?.minRoAmount !== undefined ? Math.round(filteredAgg[0]?.minRoAmount * 100) / 100 : 0;
    const maxRoAmount = filteredAgg[0]?.maxRoAmount !== undefined ? Math.round(filteredAgg[0]?.maxRoAmount * 100) / 100 : 0;
    const percentageOfTotal =
      totalRevenue > 0 ? Math.round((filteredRevenue / totalRevenue) * 10000) / 100 : 0;

    // 3. Monthly Breakdown across this report
    const monthlyAgg = await this.reportRecordModel.aggregate([
      { $match: { reportId: reportObjectId, closeDate: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: {
            year: { $year: '$closeDate' },
            month: { $month: '$closeDate' },
          },
          revenue: { $sum: '$roAmount' },
          count: { $sum: 1 },
          avgRo: { $avg: '$roAmount' },
        },
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 },
      },
    ]);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyBreakdown = monthlyAgg.map((m) => {
      const year = m._id.year;
      const month = m._id.month;
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const label = `${monthNames[month - 1]} ${year}`;
      return {
        month: monthKey,
        label,
        year,
        revenue: Math.round((m.revenue || 0) * 100) / 100,
        count: m.count,
        avgRo: Math.round((m.avgRo || 0) * 100) / 100,
      };
    });

    return {
      reportId: id,
      reportName: report.name,
      totalRevenue,
      totalRecords,
      overallAvgRo,
      filteredRevenue,
      filteredCount,
      filteredAvgRoAmount,
      percentageOfTotal,
      minCloseDate,
      maxCloseDate,
      minRoAmount,
      maxRoAmount,
      monthlyBreakdown,
    };
  }

  async update(id: string, updateData: Partial<IReport>, userId: string) {
    const before = await this.reportModel.findById(id).lean();
    if (!before) throw new NotFoundException('Report not found');

    const updated = await this.reportModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate('uploadedBy', 'name email')
      .lean();

    await this.auditService.log({
      dealershipId: before.dealershipId,
      userId,
      entityType: 'Report',
      entityId: before._id,
      action: 'REPORT_EDITED',
      before,
      after: updated,
    });

    return updated;
  }

  async delete(id: string, userId: string) {
    const report = await this.reportModel.findById(id);
    if (!report) throw new NotFoundException('Report not found');

    await Promise.all([
      this.reportModel.findByIdAndDelete(id),
      this.reportRecordModel.deleteMany({ reportId: id }),
    ]);

    await this.auditService.log({
      dealershipId: report.dealershipId,
      userId,
      entityType: 'Report',
      entityId: report._id,
      action: 'REPORT_DELETED',
      before: { name: report.name, recordCount: report.recordCount },
    });

    return { message: 'Report and associated records deleted successfully' };
  }

  async deleteAll(
    userId: string,
    dealershipId?: string,
    dateRange?: { dateFrom?: string; dateTo?: string }
  ): Promise<{ message: string; deletedCount: number; deletedRecordsCount: number }> {
    const filter: any = {};
    if (dealershipId && dealershipId !== 'all') {
      filter.dealershipId = new Types.ObjectId(dealershipId);
    }

    if (dateRange?.dateFrom || dateRange?.dateTo) {
      const fromDate = dateRange.dateFrom ? parseUtcStartOfDay(dateRange.dateFrom) : undefined;
      const toDate = dateRange.dateTo ? parseUtcEndOfDay(dateRange.dateTo) : undefined;
      const isSingleDay = Boolean(dateRange.dateFrom && dateRange.dateTo && dateRange.dateFrom === dateRange.dateTo);

      if (fromDate && toDate) {
        if (isSingleDay) {
          filter.$or = [
            {
              reportDateFrom: { $lte: toDate },
              reportDateTo: { $gte: fromDate },
            },
            {
              createdAt: { $gte: fromDate, $lte: toDate },
            },
          ];
        } else {
          filter.$or = [
            {
              reportDateFrom: { $lte: toDate },
              reportDateTo: { $gte: fromDate },
            },
            {
              reportDateFrom: { $exists: false },
              createdAt: { $gte: fromDate, $lte: toDate },
            },
            {
              reportDateFrom: null,
              createdAt: { $gte: fromDate, $lte: toDate },
            },
          ];
        }
      } else if (fromDate) {
        filter.$or = [
          { reportDateTo: { $gte: fromDate } },
          { reportDateTo: { $exists: false }, createdAt: { $gte: fromDate } },
          { reportDateFrom: null, createdAt: { $gte: fromDate } },
        ];
      } else if (toDate) {
        filter.$or = [
          { reportDateFrom: { $lte: toDate } },
          { reportDateFrom: { $exists: false }, createdAt: { $lte: toDate } },
          { reportDateFrom: null, createdAt: { $lte: toDate } },
        ];
      }
    }

    const reports = await this.reportModel.find(filter).select('_id name recordCount').lean();
    if (!reports.length) {
      return {
        message: 'No reports found to delete',
        deletedCount: 0,
        deletedRecordsCount: 0,
      };
    }

    const reportIds = reports.map((r) => r._id);

    const [deleteRecordsResult, deleteReportsResult] = await Promise.all([
      this.reportRecordModel.deleteMany({ reportId: { $in: reportIds } }),
      this.reportModel.deleteMany({ _id: { $in: reportIds } }),
    ]);

    await this.auditService.log({
      dealershipId: dealershipId && dealershipId !== 'all' ? new Types.ObjectId(dealershipId) : (reports[0]?.dealershipId || new Types.ObjectId()),
      userId,
      entityType: 'Report',
      entityId: new Types.ObjectId(),
      action: 'REPORT_DELETED',
      before: {
        totalReportsDeleted: deleteReportsResult.deletedCount,
        totalRecordsDeleted: deleteRecordsResult.deletedCount,
        scope: dealershipId ? `Dealership: ${dealershipId}` : 'ALL',
        dateRange: dateRange || 'ALL_TIME',
      },
    });

    return {
      message: `Successfully deleted ${deleteReportsResult.deletedCount} reports and ${deleteRecordsResult.deletedCount} associated records`,
      deletedCount: deleteReportsResult.deletedCount,
      deletedRecordsCount: deleteRecordsResult.deletedCount,
    };
  }

  async duplicate(id: string, userId: string) {
    const sourceReport = await this.reportModel.findById(id).lean();
    if (!sourceReport) throw new NotFoundException('Report not found');

    const newReport = await this.reportModel.create({
      ...sourceReport,
      _id: new Types.ObjectId(),
      name: `${sourceReport.name} (Copy)`,
      uploadedBy: new Types.ObjectId(userId),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Copy records
    const records = await this.reportRecordModel.find({ reportId: id }).lean();
    if (records.length > 0) {
      const clonedRecords = records.map((r) => ({
        ...r,
        _id: new Types.ObjectId(),
        reportId: newReport._id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      await this.reportRecordModel.insertMany(clonedRecords);
    }

    await this.auditService.log({
      dealershipId: newReport.dealershipId,
      userId,
      entityType: 'Report',
      entityId: newReport._id,
      action: 'REPORT_UPLOADED',
      metadata: { duplicatedFrom: id },
    });

    return newReport;
  }

  async generatePdf(
    id: string,
    templateId?: string,
    customSettings?: any,
    dateFrom?: string,
    dateTo?: string
  ): Promise<Buffer> {
    const report = await this.reportModel.findById(id).populate('dealershipId');
    if (!report) throw new NotFoundException('Report not found');

    const filter: any = { reportId: new Types.ObjectId(id) };
    if (dateFrom || dateTo) {
      filter.closeDate = {};
      if (dateFrom) filter.closeDate.$gte = parseUtcStartOfDay(dateFrom);
      if (dateTo) {
        filter.closeDate.$lte = parseUtcEndOfDay(dateTo);
      }
    }

    const records = await this.reportRecordModel.find(filter).sort({ closeDate: -1 }).lean();

    let templateSettings: any = customSettings;
    if (!templateSettings && templateId) {
      const template = await this.templateModel.findById(templateId);
      if (template?.pdfSettings) {
        templateSettings = template.pdfSettings;
      }
    }

    if (dateFrom && dateTo && templateSettings) {
      templateSettings.dateRangeText = `${new Date(dateFrom).toLocaleDateString()} - ${new Date(dateTo).toLocaleDateString()}`;
    }

    return PdfGenerator.generateReportPdf(report, records, templateSettings);
  }

  async exportCsv(id: string): Promise<string> {
    const records = await this.reportRecordModel.find({ reportId: id }).lean();
    if (records.length === 0) return '';

    const headers = [
      'Entity ID',
      'Customer Name',
      'Vehicle Year',
      'Vehicle Make',
      'Vehicle Model',
      'Campaign',
      'Campaign Insert Date',
      'Event Number',
      'Close Date',
      'RO Amount',
      'Status',
    ];

    const lines = [headers.join(',')];
    for (const r of records) {
      const row = [
        `"${r.externalEntityId || ''}"`,
        `"${(r.customerName || '').replace(/"/g, '""')}"`,
        `"${r.vehicle?.year || ''}"`,
        `"${r.vehicle?.make || ''}"`,
        `"${r.vehicle?.model || ''}"`,
        `"${r.campaignName || ''}"`,
        `"${r.campaignInsertDate ? new Date(r.campaignInsertDate).toLocaleDateString() : ''}"`,
        `"${r.eventNumber || ''}"`,
        `"${r.closeDate ? new Date(r.closeDate).toLocaleDateString() : ''}"`,
        `"${r.roAmount !== undefined && r.roAmount !== null ? r.roAmount.toFixed(2) : ''}"`,
        `"${r.recordStatus}"`,
      ];
      lines.push(row.join(','));
    }

    return lines.join('\n');
  }

  async exportXlsx(id: string): Promise<Buffer> {
    const records = await this.reportRecordModel.find({ reportId: id }).lean();
    const rows = records.map((r) => ({
      'Entity ID': r.externalEntityId || '',
      'Customer Name': r.customerName || '',
      'Vehicle Year': r.vehicle?.year || '',
      'Vehicle Make': r.vehicle?.make || '',
      'Vehicle Model': r.vehicle?.model || '',
      'Campaign': r.campaignName || '',
      'Insert Date': r.campaignInsertDate ? new Date(r.campaignInsertDate).toLocaleDateString() : '',
      'Event #': r.eventNumber || '',
      'Close Date': r.closeDate ? new Date(r.closeDate).toLocaleDateString() : '',
      'RO Amount': r.roAmount !== undefined && r.roAmount !== null ? r.roAmount : '',
      'Record Status': r.recordStatus,
    }));

    const XLSX: typeof XLSXType = require('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Records');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
