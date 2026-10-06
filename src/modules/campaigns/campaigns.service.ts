import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ICampaign } from '../../models/Campaign.model';

@Injectable()
export class CampaignsService {
  constructor(@InjectModel('Campaign') private campaignModel: Model<ICampaign>) {}

  async findAll(dealershipId?: string) {
    const filter = dealershipId ? { dealershipId: new Types.ObjectId(dealershipId) } : {};
    return this.campaignModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async findById(id: string) {
    const campaign = await this.campaignModel.findById(id).lean();
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async create(data: Partial<ICampaign>, userId: string) {
    return this.campaignModel.create({
      ...data,
      createdBy: new Types.ObjectId(userId),
    });
  }

  async update(id: string, data: Partial<ICampaign>) {
    const updated = await this.campaignModel.findByIdAndUpdate(id, data, { new: true }).lean();
    if (!updated) throw new NotFoundException('Campaign not found');
    return updated;
  }
}
