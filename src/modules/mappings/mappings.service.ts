import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IColumnMapping } from '../../models/ColumnMapping.model';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class MappingsService {
  constructor(
    @InjectModel('ColumnMapping') private mappingModel: Model<IColumnMapping>,
    private auditService: AuditService
  ) {}

  async findByDealership(dealershipId: string) {
    return this.mappingModel
      .find({ dealershipId: new Types.ObjectId(dealershipId) })
      .sort({ sourceColumn: 1 })
      .lean();
  }

  async saveMappings(
    dealershipId: string,
    mappings: Array<{
      sourceColumn: string;
      targetField: string;
      dataType: 'string' | 'number' | 'currency' | 'date' | 'boolean';
      transformation?: 'none' | 'trim' | 'uppercase' | 'lowercase' | 'parse_currency' | 'parse_date';
      isRequired?: boolean;
    }>,
    userId: string
  ) {
    const results = [];
    for (const m of mappings) {
      const res = await this.mappingModel.findOneAndUpdate(
        { dealershipId: new Types.ObjectId(dealershipId), sourceColumn: m.sourceColumn },
        {
          dealershipId: new Types.ObjectId(dealershipId),
          sourceColumn: m.sourceColumn,
          targetField: m.targetField,
          dataType: m.dataType,
          transformation: m.transformation || 'none',
          isRequired: m.isRequired || false,
          createdBy: new Types.ObjectId(userId),
        },
        { upsert: true, new: true }
      );
      results.push(res);
    }

    await this.auditService.log({
      dealershipId,
      userId,
      entityType: 'ColumnMapping',
      entityId: results[0]?._id || new Types.ObjectId(),
      action: 'COLUMN_MAPPING_UPDATED',
      metadata: { count: mappings.length },
    });

    return results;
  }

  async deleteMapping(id: string) {
    const res = await this.mappingModel.findByIdAndDelete(id);
    if (!res) throw new NotFoundException('Mapping not found');
    return { message: 'Mapping removed' };
  }
}
