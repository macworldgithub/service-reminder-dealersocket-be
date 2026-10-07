import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IReportRecord, RecordStatus } from '../../models/ReportRecord.model';
import { IReport } from '../../models/Report.model';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RecordsService {
  constructor(
    @InjectModel('ReportRecord') private recordModel: Model<IReportRecord>,
    @InjectModel('Report') private reportModel: Model<IReport>,
    private auditService: AuditService
  ) {}

  async findRecords(
    reportId: string,
    query: {
      search?: string;
      recordStatus?: RecordStatus;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const filter: any = { reportId: new Types.ObjectId(reportId) };

    if (query.recordStatus) {
      filter.recordStatus = query.recordStatus;
    }

    if (query.dateFrom || query.dateTo) {
      filter.closeDate = {};
      if (query.dateFrom) {
        filter.closeDate.$gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        const toDate = new Date(query.dateTo);
        toDate.setHours(23, 59, 59, 999);
        filter.closeDate.$lte = toDate;
      }
    }

    if (query.search) {
      const term = query.search.trim();
      filter.$or = [
        { customerName: { $regex: term, $options: 'i' } },
        { externalEntityId: { $regex: term, $options: 'i' } },
        { eventNumber: { $regex: term, $options: 'i' } },
        { campaignName: { $regex: term, $options: 'i' } },
        { 'vehicle.model': { $regex: term, $options: 'i' } },
        { 'vehicle.make': { $regex: term, $options: 'i' } },
      ];
    }

    const sort: any = {};
    if (query.sortBy) {
      sort[query.sortBy] = query.sortOrder === 'asc' ? 1 : -1;
    } else {
      sort.createdAt = 1;
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.recordModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('lastEditedBy', 'name email')
        .lean(),
      this.recordModel.countDocuments(filter),
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

  async findRecordById(reportId: string, recordId: string) {
    const record = await this.recordModel
      .findOne({ _id: new Types.ObjectId(recordId), reportId: new Types.ObjectId(reportId) })
      .populate('lastEditedBy', 'name email')
      .lean();

    if (!record) throw new NotFoundException('Record not found');

    // Fetch change history for this specific record
    const history = await this.auditService.getLogs({
      entityId: recordId,
      entityType: 'ReportRecord',
      limit: 20,
    });

    return {
      record,
      history: history.items,
    };
  }

  async createRecord(reportId: string, data: Partial<IReportRecord>, userId: string) {
    const report = await this.reportModel.findById(reportId);
    if (!report) throw new NotFoundException('Report not found');

    const newRecord = await this.recordModel.create({
      ...data,
      reportId: report._id,
      dealershipId: report.dealershipId,
      sourceData: data.sourceData || { manualEntry: true, enteredAt: new Date() },
      lastEditedBy: new Types.ObjectId(userId),
    });

    // Update report count
    await this.reportModel.findByIdAndUpdate(reportId, { $inc: { recordCount: 1 } });

    await this.auditService.log({
      dealershipId: report.dealershipId,
      userId,
      entityType: 'ReportRecord',
      entityId: newRecord._id,
      action: 'RECORD_CREATED',
      after: newRecord.toObject(),
    });

    return newRecord;
  }

  async updateRecord(
    reportId: string,
    recordId: string,
    updateData: Partial<IReportRecord>,
    userId: string
  ) {
    const before = await this.recordModel.findOne({
      _id: new Types.ObjectId(recordId),
      reportId: new Types.ObjectId(reportId),
    });

    if (!before) throw new NotFoundException('Record not found');

    // Never overwrite sourceData directly during normal edits
    delete (updateData as any).sourceData;
    delete (updateData as any)._id;
    delete (updateData as any).reportId;

    const updated = await this.recordModel
      .findByIdAndUpdate(
        recordId,
        {
          ...updateData,
          lastEditedBy: new Types.ObjectId(userId),
        },
        { new: true }
      )
      .populate('lastEditedBy', 'name email')
      .lean();

    await this.auditService.log({
      dealershipId: before.dealershipId,
      userId,
      entityType: 'ReportRecord',
      entityId: before._id,
      action: 'RECORD_UPDATED',
      before: before.toObject(),
      after: updated,
    });

    return updated;
  }

  async deleteRecord(reportId: string, recordId: string, userId: string) {
    const record = await this.recordModel.findOne({
      _id: new Types.ObjectId(recordId),
      reportId: new Types.ObjectId(reportId),
    });

    if (!record) throw new NotFoundException('Record not found');

    await this.recordModel.findByIdAndDelete(recordId);
    await this.reportModel.findByIdAndUpdate(reportId, { $inc: { recordCount: -1 } });

    await this.auditService.log({
      dealershipId: record.dealershipId,
      userId,
      entityType: 'ReportRecord',
      entityId: record._id,
      action: 'RECORD_DELETED',
      before: record.toObject(),
    });

    return { message: 'Record deleted successfully' };
  }

  async bulkDelete(reportId: string, recordIds: string[], userId: string) {
    const report = await this.reportModel.findById(reportId);
    if (!report) throw new NotFoundException('Report not found');

    const objectIds = recordIds.map((id) => new Types.ObjectId(id));
    const result = await this.recordModel.deleteMany({
      _id: { $in: objectIds },
      reportId: new Types.ObjectId(reportId),
    });

    await this.reportModel.findByIdAndUpdate(reportId, {
      $inc: { recordCount: -result.deletedCount },
    });

    await this.auditService.log({
      dealershipId: report.dealershipId,
      userId,
      entityType: 'ReportRecord',
      entityId: report._id,
      action: 'RECORD_DELETED',
      metadata: { deletedCount: result.deletedCount, recordIds },
    });

    return { deletedCount: result.deletedCount };
  }

  async bulkUpdateStatus(
    reportId: string,
    recordIds: string[],
    status: RecordStatus,
    userId: string
  ) {
    const objectIds = recordIds.map((id) => new Types.ObjectId(id));
    const result = await this.recordModel.updateMany(
      {
        _id: { $in: objectIds },
        reportId: new Types.ObjectId(reportId),
      },
      {
        $set: { recordStatus: status, lastEditedBy: new Types.ObjectId(userId) },
      }
    );

    return { modifiedCount: result.modifiedCount };
  }

  async populateMissingEmails(reportId: string, userId: string) {
    const report = await this.reportModel.findById(reportId);
    if (!report) throw new NotFoundException('Report not found');

    const records = await this.recordModel.find({
      reportId: new Types.ObjectId(reportId),
      $or: [
        { customerEmail: { $exists: false } },
        { customerEmail: null },
        { customerEmail: '' },
      ],
    });

    let count = 0;
    for (const rec of records) {
      let email = '';
      if (rec.customerName && rec.customerName !== 'Unknown') {
        const clean = rec.customerName
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .trim()
          .replace(/\s+/g, '.');
        email = `${clean}@gmail.com`;
      } else {
        email = `customer.${rec.externalEntityId || rec._id.toString().slice(-4)}@gmail.com`;
      }

      await this.recordModel.updateOne(
        { _id: rec._id },
        {
          $set: {
            customerEmail: email,
            lastEditedBy: new Types.ObjectId(userId),
          },
        }
      );
      count++;
    }

    if (count > 0) {
      await this.auditService.log({
        dealershipId: report.dealershipId,
        userId,
        entityType: 'ReportRecord',
        entityId: report._id,
        action: 'RECORD_UPDATED',
        metadata: { autoPopulatedEmailsCount: count },
      });
    }

    return { modifiedCount: count };
  }
}
