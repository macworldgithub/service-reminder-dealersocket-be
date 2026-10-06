import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as XLSX from 'xlsx';
import { IReport } from '../../models/Report.model';
import { IReportRecord } from '../../models/ReportRecord.model';
import { ITemplate } from '../../models/Template.model';
import { AuditService } from '../audit/audit.service';
import { PdfGenerator } from '../../parsers/pdf.generator';

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
    page?: number;
    limit?: number;
  }) {
    const filter: any = {};
    if (query.dealershipId) filter.dealershipId = new Types.ObjectId(query.dealershipId);
    if (query.campaignName) filter.campaignName = query.campaignName;
    if (query.status) filter.status = query.status;
    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { campaignName: { $regex: query.search, $options: 'i' } },
        { sourceFileName: { $regex: query.search, $options: 'i' } },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('uploadedBy', 'name email')
        .populate('dealershipId', 'name code')
        .lean(),
      this.reportModel.countDocuments(filter),
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
      totalRoRevenue: roSum[0]?.totalAmount || 0,
      avgRoAmount: roSum[0]?.avgAmount || 0,
    };

    return {
      report,
      versions,
      stats,
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

  async generatePdf(id: string, templateId?: string): Promise<Buffer> {
    const report = await this.reportModel.findById(id).populate('dealershipId');
    if (!report) throw new NotFoundException('Report not found');

    const records = await this.reportRecordModel.find({ reportId: id }).sort({ closeDate: -1 });

    let templateSettings: any;
    if (templateId) {
      const template = await this.templateModel.findById(templateId);
      if (template?.pdfSettings) {
        templateSettings = template.pdfSettings;
      }
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

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Records');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
