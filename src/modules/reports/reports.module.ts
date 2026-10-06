import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Report } from '../../models/Report.model';
import { ReportRecord } from '../../models/ReportRecord.model';
import { Template } from '../../models/Template.model';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Report', schema: Report.schema },
      { name: 'ReportRecord', schema: ReportRecord.schema },
      { name: 'Template', schema: Template.schema },
    ]),
    AuditModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
