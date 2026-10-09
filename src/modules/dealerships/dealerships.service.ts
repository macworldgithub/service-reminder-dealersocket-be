import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IDealership } from '../../models/Dealership.model';
import { IUser } from '../../models/User.model';

export const SYSTEM_STORES = [
  { name: 'Berwick MG', code: 'BMG-01', apiKey: 'ds_live_sk_bmg_4b2e81a9c3d0f51728ea' },
  { name: 'Cranbourne Hyundai', code: 'CBH-01', apiKey: 'ds_live_sk_cbh_7d3a91e5f2b8c40619db' },
  { name: 'Dandenong Mitsubishi', code: 'DNM-01', apiKey: 'ds_live_sk_dnm_6c1f80d4e9a7b39508ca' },
  { name: 'South Morang Hyundai', code: 'SMH-01', apiKey: 'ds_live_sk_9a8f27c3e104b46298fa' },
  { name: 'South Morang Kia', code: 'SMK-01', apiKey: 'ds_live_sk_smk_5a0e79c3d8f6a28497b9' },
  { name: 'Southland Kia & Isuzu Ute', code: 'SKI-01', apiKey: 'ds_live_sk_ski_3e9d68b2c7e5f17386a8' },
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
              webhookApiKey: store.apiKey,
            },
          });
          this.logger.log(`Initialized system store: ${store.name} (${store.code})`);
        } else {
          // Ensure store has its unique webhook API key configured
          const currentSettings = existing.settings || {};
          if (!currentSettings.webhookApiKey || currentSettings.webhookApiKey !== store.apiKey) {
            existing.settings = {
              ...currentSettings,
              webhookApiKey: store.apiKey,
            };
            await this.dealershipModel.findByIdAndUpdate(existing._id, {
              settings: existing.settings,
            });
          }
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
