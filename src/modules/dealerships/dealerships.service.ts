import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IDealership } from '../../models/Dealership.model';
import { IUser } from '../../models/User.model';

export const SYSTEM_STORES = [
  { name: 'Berwick MG', code: 'BMG-01' },
  { name: 'Cranbourne Hyundai', code: 'CBH-01' },
  { name: 'Dandenong Mitsubishi', code: 'DNM-01' },
  { name: 'South Morang Hyundai', code: 'SMH-01' },
  { name: 'South Morang Kia', code: 'SMK-01' },
  { name: 'Southland Kia & Isuzu Ute', code: 'SKI-01' },
];

@Injectable()
export class DealershipsService implements OnModuleInit {
  private readonly logger = new Logger(DealershipsService.name);

  constructor(
    @InjectModel('Dealership') private dealershipModel: Model<IDealership>,
    @InjectModel('User') private userModel: Model<IUser>
  ) {}

  async onModuleInit() {
    try {
      const storeIds: any[] = [];
      for (const store of SYSTEM_STORES) {
        let existing = await this.dealershipModel.findOne({
          $or: [{ code: store.code }, { name: store.name }],
        });

        if (!existing) {
          existing = await this.dealershipModel.create({
            name: store.name,
            code: store.code,
            timezone: 'Australia/Melbourne',
            status: 'ACTIVE',
            settings: {
              autoDetectHeaders: true,
              defaultReportType: 'DealerSocket Closed RO',
              duplicateDetectionKeys: ['externalEntityId', 'eventNumber'],
              allowedFileTypes: ['csv', 'xlsx', 'xls', 'pdf'],
            },
          });
          this.logger.log(`Initialized system store: ${store.name} (${store.code})`);
        }
        storeIds.push(existing._id);
      }

      // Automatically ensure admin users have access to all 6 stores
      if (storeIds.length > 0) {
        await this.userModel.updateMany(
          { role: 'ADMIN' },
          { $addToSet: { dealershipIds: { $each: storeIds } } }
        );
      }
    } catch (err: any) {
      this.logger.warn(`Could not verify system stores on init: ${err.message}`);
    }
  }

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
