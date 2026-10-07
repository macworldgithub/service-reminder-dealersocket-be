import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  Req,
  Ip,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * Main Inbound Webhook: Ingests DealerSocket PDF, CSV, or Excel reports
   * Accepts:
   * 1. multipart/form-data with 'file'
   * 2. application/json with 'fileBase64' & 'fileName'
   */
  @Post('ingest')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async ingestFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Headers('x-api-key') headerApiKey: string,
    @Headers('authorization') authHeader: string,
    @Query('apiKey') queryApiKey: string,
    @Query('campaignName') queryCampaign: string,
    @Ip() ip: string
  ) {
    const apiKey = headerApiKey || authHeader || queryApiKey || body?.apiKey;
    const dealership = await this.webhooksService.authenticateKey(apiKey);

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

    return this.webhooksService.ingestReport({
      fileBuffer,
      fileName,
      dealership,
      campaignName,
      sourceIp: ip,
    });
  }

  /**
   * Alias route for compatibility
   */
  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async ingestReportsAlias(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Headers('x-api-key') headerApiKey: string,
    @Headers('authorization') authHeader: string,
    @Query('apiKey') queryApiKey: string,
    @Query('campaignName') queryCampaign: string,
    @Ip() ip: string
  ) {
    return this.ingestFile(file, body, headerApiKey, authHeader, queryApiKey, queryCampaign, ip);
  }

  /**
   * Health ping for testing connection from DealerSocket DMS or external scripts
   */
  @Post('ping')
  @HttpCode(HttpStatus.OK)
  async ping(
    @Headers('x-api-key') headerApiKey: string,
    @Headers('authorization') authHeader: string,
    @Query('apiKey') queryApiKey: string,
    @Body('apiKey') bodyApiKey: string,
    @Ip() ip: string
  ) {
    const apiKey = headerApiKey || authHeader || queryApiKey || bodyApiKey;
    return this.webhooksService.testPing(apiKey, ip);
  }

  /**
   * Get active webhook endpoint configuration, API key, and example cURL
   */
  @Get('config')
  async getConfig(@Query('dealershipId') dealershipId?: string) {
    const config = await this.webhooksService.getConfig(dealershipId);
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
    @Query('limit') limit?: number
  ) {
    const logs = await this.webhooksService.getLogs(dealershipId, limit ? Number(limit) : 20);
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
    @Query('apiKey') queryApiKey: string,
    @Query('sample') sampleName: string,
    @Ip() ip: string
  ) {
    const apiKey = headerApiKey || authHeader || queryApiKey;
    const dealership = await this.webhooksService.authenticateKey(apiKey);

    // Look for sample PDFs in the workspace root
    const sampleFiles = [
      'SMHY-(NSD)S-Rmndr(Mtdr).pdf',
      'HY Closed RO.pdf',
      'SMHY - Comp Service (in PMA).pdf',
      'SMHY - Comp Service (out PMA).pdf',
    ];

    const targetName = sampleName || sampleFiles[0];
    const candidatePaths = [
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
      fileName: `Webhook_Test_${path.basename(foundPath)}`,
      dealership,
      campaignName: 'SMHY Closed RO Webhook Ingest',
      sourceIp: ip,
    });
  }
}
