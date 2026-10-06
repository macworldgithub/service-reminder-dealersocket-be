import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IDealership } from '../../models/Dealership.model';

@Injectable()
export class DealershipsService {
  constructor(@InjectModel('Dealership') private dealershipModel: Model<IDealership>) {}

  async findAll(status?: string) {
    const filter = status ? { status } : {};
    return this.dealershipModel.find(filter).sort({ name: 1 }).lean();
  }

  async findById(id: string) {
    const item = await this.dealershipModel.findById(id).lean();
    if (!item) throw new NotFoundException('Dealership not found');
    return item;
  }

  async create(data: Partial<IDealership>) {
    return this.dealershipModel.create(data);
  }

  async update(id: string, data: Partial<IDealership>) {
    const updated = await this.dealershipModel
      .findByIdAndUpdate(id, data, { new: true })
      .lean();
    if (!updated) throw new NotFoundException('Dealership not found');
    return updated;
  }
}
