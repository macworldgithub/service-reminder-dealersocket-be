import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { Campaign } from '../../models/Campaign.model';
import { Report } from '../../models/Report.model';
import { ReportRecord } from '../../models/ReportRecord.model';
import { Dealership } from '../../models/Dealership.model';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Campaign', schema: Campaign.schema },
      { name: 'Report', schema: Report.schema },
      { name: 'ReportRecord', schema: ReportRecord.schema },
      { name: 'Dealership', schema: Dealership.schema },
    ]),
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
