import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { Import } from '../../models/Import.model';
import { Report } from '../../models/Report.model';
import { ReportRecord } from '../../models/ReportRecord.model';
import { ColumnMapping } from '../../models/ColumnMapping.model';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Import', schema: Import.schema },
      { name: 'Report', schema: Report.schema },
      { name: 'ReportRecord', schema: ReportRecord.schema },
      { name: 'ColumnMapping', schema: ColumnMapping.schema },
    ]),
    AuditModule,
  ],
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
