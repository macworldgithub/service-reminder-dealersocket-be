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

  onModuleInit() {
    // Fire-and-forget so it never delays serverless cold starts / first request
    this.ensureSystemStores().catch((err: any) =>
      this.logger.warn(`Could not verify system stores on init: ${err.message}`)
    );
  }

  private async ensureSystemStores() {
    // Single batched read instead of one query per store
    const existingAll = await this.dealershipModel
      .find({
        $or: [
          { code: { $in: SYSTEM_STORES.map((s) => s.code) } },
          { name: { $in: SYSTEM_STORES.map((s) => s.name) } },
        ],
      })
      .select('_id name code settings')
      .lean();

    const storeIds: any[] = [];
    const writes: Promise<any>[] = [];

    for (const store of SYSTEM_STORES) {
      const existing: any = existingAll.find((d: any) => d.code === store.code || d.name === store.name);

      if (!existing) {
        const created = await this.dealershipModel.create({
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
        storeIds.push(created._id);
        continue;
      }

      // Ensure store has its unique webhook API key configured
      const currentSettings = existing.settings || {};
      if (currentSettings.webhookApiKey !== store.apiKey) {
        writes.push(
          this.dealershipModel.updateOne(
            { _id: existing._id },
            { $set: { 'settings.webhookApiKey': store.apiKey } }
          )
        );
      }
      storeIds.push(existing._id);
    }

    await Promise.all(writes);

    // Ensure admin users have access to all stores (only touches users missing one)
    if (storeIds.length > 0) {
      await this.userModel.updateMany(
        { role: 'ADMIN', dealershipIds: { $not: { $all: storeIds } } },
        { $addToSet: { dealershipIds: { $each: storeIds } } }
      );
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
