import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';
import { ReportRecord } from '../../models/ReportRecord.model';
import { Report } from '../../models/Report.model';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'ReportRecord', schema: ReportRecord.schema },
      { name: 'Report', schema: Report.schema },
    ]),
    AuditModule,
  ],
  controllers: [RecordsController],
  providers: [RecordsService],
  exports: [RecordsService],
})
export class RecordsModule {}
