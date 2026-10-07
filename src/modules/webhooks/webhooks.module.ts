import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { Dealership } from '../../models/Dealership.model';
import { Report } from '../../models/Report.model';
import { ReportRecord } from '../../models/ReportRecord.model';
import { Import } from '../../models/Import.model';
import { WebhookLog } from '../../models/WebhookLog.model';
import { User } from '../../models/User.model';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Dealership', schema: Dealership.schema },
      { name: 'Report', schema: Report.schema },
      { name: 'ReportRecord', schema: ReportRecord.schema },
      { name: 'Import', schema: Import.schema },
      { name: 'WebhookLog', schema: WebhookLog.schema, collection: 'auditlogs' },
      { name: 'User', schema: User.schema },
    ]),
    AuditModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
