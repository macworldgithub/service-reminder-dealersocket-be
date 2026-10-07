import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ENV } from './config/env';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DealershipsModule } from './modules/dealerships/dealerships.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RecordsModule } from './modules/records/records.module';
import { ImportsModule } from './modules/imports/imports.module';
import { MappingsModule } from './modules/mappings/mappings.module';
import { AuditModule } from './modules/audit/audit.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(ENV.MONGODB_URI, {
      autoIndex: true,
    }),
    AuthModule,
    UsersModule,
    DealershipsModule,
    ReportsModule,
    RecordsModule,
    ImportsModule,
    MappingsModule,
    AuditModule,
    TemplatesModule,
    CampaignsModule,
    WebhooksModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
