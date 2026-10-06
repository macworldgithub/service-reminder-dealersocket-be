import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ITemplate } from '../../models/Template.model';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel('Template') private templateModel: Model<ITemplate>,
    private auditService: AuditService
  ) {}

  async findAll(dealershipId?: string, type?: string) {
    const filter: any = {};
    if (dealershipId) filter.dealershipId = new Types.ObjectId(dealershipId);
    if (type) filter.type = type;

    return this.templateModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async findById(id: string) {
    const template = await this.templateModel.findById(id).lean();
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async create(data: Partial<ITemplate>, userId: string) {
    const template = await this.templateModel.create({
      ...data,
      createdBy: new Types.ObjectId(userId),
    });

    await this.auditService.log({
      dealershipId: template.dealershipId,
      userId,
      entityType: 'Report',
      entityId: template._id,
      action: 'PDF_TEMPLATE_UPDATED',
      after: template.toObject(),
    });

    return template;
  }

  async update(id: string, updateData: Partial<ITemplate>, userId: string) {
    const before = await this.templateModel.findById(id).lean();
    if (!before) throw new NotFoundException('Template not found');

    const updated = await this.templateModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .lean();

    await this.auditService.log({
      dealershipId: before.dealershipId,
      userId,
      entityType: 'Report',
      entityId: before._id,
      action: 'PDF_TEMPLATE_UPDATED',
      before,
      after: updated,
    });

    return updated;
  }

  async delete(id: string) {
    const res = await this.templateModel.findByIdAndDelete(id);
    if (!res) throw new NotFoundException('Template not found');
    return { message: 'Template deleted successfully' };
  }
}
