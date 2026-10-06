import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MappingsController } from './mappings.controller';
import { MappingsService } from './mappings.service';
import { ColumnMapping } from '../../models/ColumnMapping.model';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'ColumnMapping', schema: ColumnMapping.schema }]),
    AuditModule,
  ],
  controllers: [MappingsController],
  providers: [MappingsService],
  exports: [MappingsService],
})
export class MappingsModule {}
