import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportsService } from './imports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, Roles } from '../../common/decorators';

@Controller('imports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('upload')
  @Roles('ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
    })
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('dealershipId') dealershipId: string,
    @Body('sheetName') sheetName: string,
    @CurrentUser('userId') userId: string
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (!dealershipId) throw new BadRequestException('dealershipId is required');

    const result = await this.importsService.analyzeFile(file, dealershipId, userId, sheetName);
    return {
      success: true,
      message: 'File analyzed successfully',
      data: result,
    };
  }

  @Post(':id/preview')
  async previewRecords(
    @Param('id') id: string,
    @Body('rawRows') rawRows: any[],
    @Body('mappings') mappings: any[],
    @Body('limit') limit?: number
  ) {
    if (!rawRows || !mappings) {
      throw new BadRequestException('rawRows and mappings are required for preview');
    }

    const preview = this.importsService.generatePreviewRecords(rawRows, mappings, limit || 50);
    return {
      success: true,
      data: preview,
    };
  }

  @Post(':id/commit')
  @Roles('ADMIN')
  async commitImport(
    @Param('id') id: string,
    @Body()
    body: {
      dealershipId: string;
      reportName: string;
      campaignName?: string;
      reportDateFrom?: string;
      reportDateTo?: string;
      rawRows: any[];
      columnMappings: any[];
      isNewVersion?: boolean;
      parentReportId?: string;
    },
    @CurrentUser('userId') userId: string
  ) {
    if (!body.dealershipId || !body.rawRows || !body.columnMappings) {
      throw new BadRequestException('Missing required fields for import commit');
    }

    const result = await this.importsService.commitImport({
      importId: id,
      dealershipId: body.dealershipId,
      userId,
      reportName: body.reportName,
      campaignName: body.campaignName,
      reportDateFrom: body.reportDateFrom,
      reportDateTo: body.reportDateTo,
      rawRows: body.rawRows,
      columnMappings: body.columnMappings,
      isNewVersion: body.isNewVersion,
      parentReportId: body.parentReportId,
    });

    return {
      success: true,
      message: 'Import committed successfully',
      data: result,
    };
  }

  @Get()
  async getImports(
    @Query('dealershipId') dealershipId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    const result = await this.importsService.getImports({ dealershipId, page, limit });
    return {
      success: true,
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  async getImportById(@Param('id') id: string) {
    const data = await this.importsService.getImportById(id);
    return {
      success: true,
      data,
    };
  }
}
