import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IAuditLog, AuditAction } from '../../models/AuditLog.model';

export interface CreateAuditLogParams {
  dealershipId: string | Types.ObjectId;
  userId?: string | Types.ObjectId;
  entityType: 'Report' | 'ReportRecord' | 'Import' | 'ColumnMapping' | 'User' | 'Dealership';
  entityId: string | Types.ObjectId;
  action: AuditAction;
  before?: any;
  after?: any;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  constructor(@InjectModel('AuditLog') private auditLogModel: Model<IAuditLog>) {}

  async log(params: CreateAuditLogParams): Promise<IAuditLog> {
    return this.auditLogModel.create({
      dealershipId: new Types.ObjectId(params.dealershipId),
      userId: params.userId ? new Types.ObjectId(params.userId) : undefined,
      entityType: params.entityType,
      entityId: new Types.ObjectId(params.entityId),
      action: params.action,
      before: params.before,
      after: params.after,
      metadata: params.metadata,
    });
  }

  async getLogs(query: {
    dealershipId?: string;
    entityId?: string;
    entityType?: string;
    action?: string;
    page?: number;
    limit?: number;
  }) {
    const filter: any = {};
    if (query.dealershipId) filter.dealershipId = new Types.ObjectId(query.dealershipId);
    if (query.entityId) filter.entityId = new Types.ObjectId(query.entityId);
    if (query.entityType) filter.entityType = query.entityType;
    if (query.action) filter.action = query.action;

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email role')
        .lean(),
      this.auditLogModel.countDocuments(filter),
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
}
