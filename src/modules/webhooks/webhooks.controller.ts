import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  Param,
  Ip,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  private resolveStoreParam(
    routeParam?: string,
    queryStore?: string,
    queryStoreCode?: string,
    queryDealershipId?: string,
    headerStoreCode?: string,
    headerDealershipId?: string,
    body?: any
  ): string | undefined {
    return (
      routeParam ||
      queryStore ||
      queryStoreCode ||
      queryDealershipId ||
      headerStoreCode ||
      headerDealershipId ||
      body?.storeCode ||
      body?.dealershipId ||
      body?.store
    );
  }

  /**
   * Main Inbound Webhook: Ingests DealerSocket PDF, CSV, or Excel reports
   * Supports store differentiation via:
   * - Store-specific API Key
   * - Route parameter :storeCode (e.g. /api/webhooks/BMG-01/ingest)
   * - Query parameters ?store=..., ?storeCode=..., or ?dealershipId=...
   * - Headers x-store-code or x-dealership-id
   * - Body fields storeCode, dealershipId, or store
   */
  @Post('ingest')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async ingestFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Headers('x-api-key') headerApiKey: string,
    @Headers('authorization') authHeader: string,
    @Headers('x-store-code') headerStoreCode: string,
    @Headers('x-dealership-id') headerDealershipId: string,
    @Query('apiKey') queryApiKey: string,
    @Query('store') queryStore: string,
    @Query('storeCode') queryStoreCode: string,
    @Query('dealershipId') queryDealershipId: string,
    @Query('campaignName') queryCampaign: string,
    @Ip() ip: string,
    @Param('storeCode') routeStoreCode?: string
  ) {
    const apiKey = headerApiKey || authHeader || queryApiKey || body?.apiKey;
    const explicitStore = this.resolveStoreParam(
      routeStoreCode,
      queryStore,
      queryStoreCode,
      queryDealershipId,
      headerStoreCode,
      headerDealershipId,
      body
    );

    let fileBuffer: Buffer;
    let fileName: string;
    const campaignName = body?.campaignName || queryCampaign;

    if (file) {
      fileBuffer = file.buffer;
      fileName = file.originalname;
    } else if (body?.fileBase64) {
      fileBuffer = Buffer.from(body.fileBase64, 'base64');
      fileName = body.fileName || 'DealerSocket_Webhook_Report.pdf';
    } else {
      throw new BadRequestException(
        'No file received. Please upload a file via multipart form field "file" or provide JSON with "fileBase64" and "fileName".'
      );
    }

    // Authenticate and differentiate store
    const dealership = await this.webhooksService.authenticateKey(
      apiKey,
      explicitStore,
      fileName,
      campaignName
    );

    return this.webhooksService.ingestReport({
      fileBuffer,
      fileName,
      dealership,
      campaignName,
      sourceIp: ip,
    });
  }

  /**
   * Direct store-specific route: /api/webhooks/:storeCode/ingest
   */
  @Post(':storeCode/ingest')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async ingestFileStoreRoute(
    @Param('storeCode') storeCode: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Headers('x-api-key') headerApiKey: string,
    @Headers('authorization') authHeader: string,
    @Headers('x-store-code') headerStoreCode: string,
    @Headers('x-dealership-id') headerDealershipId: string,
    @Query('apiKey') queryApiKey: string,
    @Query('store') queryStore: string,
    @Query('storeCode') queryStoreCode: string,
    @Query('dealershipId') queryDealershipId: string,
    @Query('campaignName') queryCampaign: string,
    @Ip() ip: string
  ) {
    return this.ingestFile(
      file,
      body,
      headerApiKey,
      authHeader,
      headerStoreCode,
      headerDealershipId,
      queryApiKey,
      queryStore,
      queryStoreCode,
      queryDealershipId,
      queryCampaign,
      ip,
      storeCode
    );
  }

  /**
   * Alias routes for compatibility
   */
  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async ingestReportsAlias(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Headers('x-api-key') headerApiKey: string,
    @Headers('authorization') authHeader: string,
    @Headers('x-store-code') headerStoreCode: string,
    @Headers('x-dealership-id') headerDealershipId: string,
    @Query('apiKey') queryApiKey: string,
    @Query('store') queryStore: string,
    @Query('storeCode') queryStoreCode: string,
    @Query('dealershipId') queryDealershipId: string,
    @Query('campaignName') queryCampaign: string,
    @Ip() ip: string
  ) {
    return this.ingestFile(
      file,
      body,
      headerApiKey,
      authHeader,
      headerStoreCode,
      headerDealershipId,
      queryApiKey,
      queryStore,
      queryStoreCode,
      queryDealershipId,
      queryCampaign,
      ip
    );
  }

  @Post(':storeCode/reports')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async ingestReportsStoreAlias(
    @Param('storeCode') storeCode: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Headers('x-api-key') headerApiKey: string,
    @Headers('authorization') authHeader: string,
    @Headers('x-store-code') headerStoreCode: string,
    @Headers('x-dealership-id') headerDealershipId: string,
    @Query('apiKey') queryApiKey: string,
    @Query('store') queryStore: string,
    @Query('storeCode') queryStoreCode: string,
    @Query('dealershipId') queryDealershipId: string,
    @Query('campaignName') queryCampaign: string,
    @Ip() ip: string
  ) {
    return this.ingestFile(
      file,
      body,
      headerApiKey,
      authHeader,
      headerStoreCode,
      headerDealershipId,
      queryApiKey,
      queryStore,
      queryStoreCode,
      queryDealershipId,
      queryCampaign,
      ip,
      storeCode
    );
  }

  /**
   * Health ping for testing connection from DealerSocket DMS or external scripts
   */
  @Post('ping')
  @HttpCode(HttpStatus.OK)
  async ping(
    @Headers('x-api-key') headerApiKey: string,
    @Headers('authorization') authHeader: string,
    @Headers('x-store-code') headerStoreCode: string,
    @Headers('x-dealership-id') headerDealershipId: string,
    @Query('apiKey') queryApiKey: string,
    @Query('store') queryStore: string,
    @Query('storeCode') queryStoreCode: string,
    @Query('dealershipId') queryDealershipId: string,
    @Body('apiKey') bodyApiKey: string,
    @Body('storeCode') bodyStoreCode: string,
    @Body('dealershipId') bodyDealershipId: string,
    @Ip() ip: string
  ) {
    const apiKey = headerApiKey || authHeader || queryApiKey || bodyApiKey;
    const explicitStore = this.resolveStoreParam(
      undefined,
      queryStore,
      queryStoreCode,
      queryDealershipId,
      headerStoreCode,
      headerDealershipId,
      { storeCode: bodyStoreCode, dealershipId: bodyDealershipId }
    );
    return this.webhooksService.testPing(apiKey, ip, explicitStore);
  }

  @Post(':storeCode/ping')
  @HttpCode(HttpStatus.OK)
  async pingStoreRoute(
    @Param('storeCode') storeCode: string,
    @Headers('x-api-key') headerApiKey: string,
    @Headers('authorization') authHeader: string,
    @Query('apiKey') queryApiKey: string,
    @Body('apiKey') bodyApiKey: string,
    @Ip() ip: string
  ) {
    const apiKey = headerApiKey || authHeader || queryApiKey || bodyApiKey;
    return this.webhooksService.testPing(apiKey, ip, storeCode);
  }

  /**
   * Get active webhook endpoint configuration, API key, and example cURL
   */
  @Get('config')
  async getConfig(
    @Query('dealershipId') dealershipId?: string,
    @Query('store') store?: string,
    @Query('storeCode') storeCode?: string
  ) {
    const targetStore = dealershipId || store || storeCode;
    const config = await this.webhooksService.getConfig(targetStore);
    return {
      success: true,
      data: config,
    };
  }

  @Get(':storeCode/config')
  async getConfigStoreRoute(@Param('storeCode') storeCode: string) {
    const config = await this.webhooksService.getConfig(storeCode);
    return {
      success: true,
      data: config,
    };
  }

  /**
   * Fetch recent webhook ingestion activity logs
   */
  @Get('logs')
  async getLogs(
    @Query('dealershipId') dealershipId?: string,
    @Query('store') store?: string,
    @Query('storeCode') storeCode?: string,
    @Query('limit') limit?: number
  ) {
    const targetStore = dealershipId || store || storeCode;
    const logs = await this.webhooksService.getLogs(targetStore, limit ? Number(limit) : 20);
    return {
      success: true,
      data: logs,
    };
  }

  @Get(':storeCode/logs')
  async getLogsStoreRoute(
    @Param('storeCode') storeCode: string,
    @Query('limit') limit?: number
  ) {
    const logs = await this.webhooksService.getLogs(storeCode, limit ? Number(limit) : 20);
    return {
      success: true,
      data: logs,
    };
  }

  /**
   * One-click demo test: Ingests an actual DealerSocket Closed RO PDF from the workspace
   */
  @Post('test-sample')
  @HttpCode(HttpStatus.CREATED)
  async testSampleIngestion(
    @Headers('x-api-key') headerApiKey: string,
    @Headers('authorization') authHeader: string,
    @Headers('x-store-code') headerStoreCode: string,
    @Headers('x-dealership-id') headerDealershipId: string,
    @Query('apiKey') queryApiKey: string,
    @Query('store') queryStore: string,
    @Query('storeCode') queryStoreCode: string,
    @Query('dealershipId') queryDealershipId: string,
    @Query('sample') sampleName: string,
    @Body('storeCode') bodyStoreCode: string,
    @Body('dealershipId') bodyDealershipId: string,
    @Ip() ip: string,
    @Param('storeCode') routeStoreCode?: string
  ) {
    const apiKey = headerApiKey || authHeader || queryApiKey;
    const explicitStore = this.resolveStoreParam(
      routeStoreCode,
      queryStore,
      queryStoreCode,
      queryDealershipId,
      headerStoreCode,
      headerDealershipId,
      { storeCode: bodyStoreCode, dealershipId: bodyDealershipId }
    );

    const dealership = await this.webhooksService.authenticateKey(apiKey, explicitStore);

    // Look for sample PDFs in the workspace root or samples directory
    const sampleFiles = [
      'South_Morang_Hyundai_Closed_RO.pdf',
      'SMHY-(NSD)S-Rmndr(Mtdr).pdf',
      'HY Closed RO.pdf',
      'South_Morang_Hyundai_Closed_RO.csv',
      'South_Morang_Hyundai_Closed_RO.xlsx',
    ];

    const targetName = sampleName || sampleFiles[0];
    const candidatePaths = [
      path.resolve(process.cwd(), 'samples', targetName),
      path.resolve(process.cwd(), 'samples', 'South_Morang_Hyundai_Closed_RO.pdf'),
      path.resolve(__dirname, '../../../../samples', targetName),
      path.resolve(__dirname, '../../../../samples', 'South_Morang_Hyundai_Closed_RO.pdf'),
      path.resolve('d:/Service_Reminder_DealerSocket/service-reminder-dealersocket-be/samples', targetName),
      path.resolve('d:/Service_Reminder_DealerSocket/service-reminder-dealersocket-be/samples', 'South_Morang_Hyundai_Closed_RO.pdf'),
      path.resolve(process.cwd(), '..', targetName),
      path.resolve(process.cwd(), targetName),
      path.resolve('d:/Service_Reminder_DealerSocket', targetName),
    ];

    let foundPath: string | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        foundPath = p;
        break;
      }
    }

    if (!foundPath) {
      throw new BadRequestException(`Sample file "${targetName}" not found in workspace.`);
    }

    const fileBuffer = fs.readFileSync(foundPath);
    return this.webhooksService.ingestReport({
      fileBuffer,
      fileName: `${dealership.code}_Webhook_${path.basename(foundPath)}`,
      dealership,
      campaignName: `${dealership.name} Closed RO Webhook Ingest`,
      sourceIp: ip,
    });
  }

  @Post(':storeCode/test-sample')
  @HttpCode(HttpStatus.CREATED)
  async testSampleIngestionStoreRoute(
    @Param('storeCode') storeCode: string,
    @Headers('x-api-key') headerApiKey: string,
    @Headers('authorization') authHeader: string,
    @Query('apiKey') queryApiKey: string,
    @Query('sample') sampleName: string,
    @Ip() ip: string
  ) {
    return this.testSampleIngestion(
      headerApiKey,
      authHeader,
      undefined as any,
      undefined as any,
      queryApiKey,
      undefined as any,
      undefined as any,
      undefined as any,
      sampleName,
      undefined as any,
      undefined as any,
      ip,
      storeCode
    );
  }
}
