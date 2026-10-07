import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ICampaign } from '../../models/Campaign.model';
import { IReport } from '../../models/Report.model';
import { IReportRecord } from '../../models/ReportRecord.model';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectModel('Campaign') private campaignModel: Model<ICampaign>,
    @InjectModel('Report') private reportModel: Model<IReport>,
    @InjectModel('ReportRecord') private reportRecordModel: Model<IReportRecord>,
    @InjectModel('Dealership') private dealershipModel: Model<any>
  ) {}

  async findAll(dealershipId?: string) {
    const filter: any = {};
    if (dealershipId && Types.ObjectId.isValid(dealershipId)) {
      filter.dealershipId = new Types.ObjectId(dealershipId);
    }
    let list = await this.campaignModel.find(filter).sort({ createdAt: -1 }).lean();
    if (list.length === 0 && dealershipId) {
      list = await this.campaignModel.find({}).sort({ createdAt: -1 }).lean();
    }
    return list;
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Invalid campaign ID');
    const campaign = await this.campaignModel.findById(id).lean();
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async create(data: Partial<ICampaign>, userId: string) {
    let dealershipId = data.dealershipId;
    if (!dealershipId || !Types.ObjectId.isValid(dealershipId.toString())) {
      const firstDealership: any = await this.dealershipModel.findOne().lean();
      if (firstDealership) {
        dealershipId = firstDealership._id;
      }
    }

    return this.campaignModel.create({
      ...data,
      dealershipId,
      createdBy: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
    });
  }

  async update(id: string, data: Partial<ICampaign>) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Invalid campaign ID');
    const updated = await this.campaignModel.findByIdAndUpdate(id, data, { new: true }).lean();
    if (!updated) throw new NotFoundException('Campaign not found');
    return updated;
  }

  async delete(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Invalid campaign ID');
    const deleted = await this.campaignModel.findByIdAndDelete(id).lean();
    if (!deleted) throw new NotFoundException('Campaign not found');
    return { message: 'Campaign deleted successfully' };
  }

  async execute(campaignId: string, reportId?: string, userId?: string) {
    if (!Types.ObjectId.isValid(campaignId)) throw new NotFoundException('Invalid campaign ID');
    const campaign = await this.campaignModel.findById(campaignId).lean();
    if (!campaign) throw new NotFoundException('Campaign not found');

    // Find target report
    let report: any;
    if (reportId && Types.ObjectId.isValid(reportId)) {
      report = await this.reportModel.findById(reportId).lean();
    }
    if (!report && campaign.dealershipId) {
      report = await this.reportModel.findOne({ dealershipId: campaign.dealershipId }).sort({ createdAt: -1 }).lean();
    }
    if (!report) {
      report = await this.reportModel.findOne({}).sort({ createdAt: -1 }).lean();
    }

    if (!report) {
      throw new NotFoundException('No report found to execute campaign against. Please upload or select a report first.');
    }

    // Fetch records for this report
    const records = await this.reportRecordModel.find({ reportId: report._id }).lean();
    if (records.length === 0) {
      throw new BadRequestException('The selected report contains no records to process.');
    }

    const steps = campaign.steps && campaign.steps.length > 0
      ? campaign.steps
      : [
          { stepNumber: 1, channel: 'SMS' as const, delayDays: 1, description: 'Day 1 Post-Service Satisfaction Check' },
          { stepNumber: 2, channel: 'EMAIL' as const, delayDays: 3, description: 'Day 3 Service Inspection Summary & Survey' },
          { stepNumber: 3, channel: 'SMS' as const, delayDays: 7, description: 'Day 7 Complimentary Car Wash Reminder' },
          { stepNumber: 4, channel: 'VA_TASK' as const, delayDays: 12, description: 'Day 12 Virtual Assistant Phone Follow-up' },
        ];

    let smsCount = 0;
    let emailCount = 0;
    let vaTaskCount = 0;

    const sampleDispatches: any[] = [];

    // Simulate dispatches across all records and steps
    for (const rec of records) {
      const customerName = rec.customerName || 'Valued Customer';
      const firstName = customerName.split(' ')[0] || customerName;
      const vehicleYear = rec.vehicle?.year || (rec as any).year || '';
      const vehicleMake = rec.vehicle?.make || (rec as any).make || '';
      const vehicleModel = rec.vehicle?.model || (rec as any).model || '';
      const vehicle = [vehicleYear, vehicleMake, vehicleModel].filter(Boolean).join(' ') || 'Vehicle';
      const roNum = rec.eventNumber || rec.sourceData?.['Event#'] || 'RO';
      const roAmount = rec.roAmount !== undefined && rec.roAmount !== null ? `$${Number(rec.roAmount).toFixed(2)}` : '$0.00';
      const email = rec.customerEmail || rec.customFields?.customerEmail || (rec as any).email || rec.sourceData?.Email || '';
      const phone = rec.customerPhone || rec.customFields?.customerPhone || (rec as any).phone || rec.sourceData?.Phone || '';

      for (const step of steps) {
        if (step.channel === 'SMS') smsCount++;
        else if (step.channel === 'EMAIL') emailCount++;
        else if (step.channel === 'VA_TASK') vaTaskCount++;

        if (sampleDispatches.length < 150) {
          let preview = '';
          if (step.channel === 'SMS') {
            preview = `Hi ${firstName}, thanks for servicing your ${vehicle} at South Morang Hyundai (RO #${roNum}, ${roAmount}). How was your experience? Reply 1 for Great, 2 for Need Help.`;
          } else if (step.channel === 'EMAIL') {
            preview = `Dear ${customerName}, your South Morang Hyundai maintenance inspection for ${vehicle} is ready. View invoice #${roNum} and rate your technician here: https://dealersocket.hub/survey/${roNum}`;
          } else {
            preview = `Concierge VA Call: Follow up with ${customerName} on ${vehicle} service (RO: ${roNum}, Total: ${roAmount}). Offer complimentary alignment voucher.`;
          }

          const scheduledTimestamp = new Date(Date.now() + step.delayDays * 24 * 60 * 60 * 1000);

          sampleDispatches.push({
            id: `${rec._id}_step_${step.stepNumber}`,
            recordId: rec._id,
            entityId: rec.externalEntityId || '—',
            customerName,
            phone: phone || '—',
            email: email || '—',
            vehicle,
            roNumber: roNum,
            roAmount,
            stepNumber: step.stepNumber,
            stepDescription: step.description,
            channel: step.channel,
            delayDays: step.delayDays,
            scheduledDate: scheduledTimestamp.toLocaleDateString(),
            status: 'QUEUED',
            preview,
          });
        }
      }
    }

    return {
      campaign: {
        _id: campaign._id,
        name: campaign.name,
        triggerType: campaign.triggerType,
        status: campaign.status,
      },
      report: {
        _id: report._id,
        name: report.name,
        campaignName: report.campaignName,
        totalRecords: records.length,
      },
      executionSummary: {
        totalRecipients: records.length,
        totalSteps: steps.length,
        totalDispatchesScheduled: records.length * steps.length,
        channelCounts: {
          sms: smsCount,
          email: emailCount,
          vaTask: vaTaskCount,
        },
        executedAt: new Date().toISOString(),
      },
      dispatches: sampleDispatches,
    };
  }
}
