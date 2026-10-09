import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, Roles } from '../../common/decorators';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  async findAll(
    @Query('dealershipId') dealershipId?: string,
    @Query('campaignName') campaignName?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ): Promise<{ success: boolean; data: any[]; meta: any }> {
    const result = await this.reportsService.findAll({
      dealershipId,
      campaignName,
      status,
      search,
      dateFrom,
      dateTo,
      page,
      limit,
    });
    return {
      success: true,
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const result = await this.reportsService.findById(id);
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id/revenue-lookup')
  async getRevenueLookup(
    @Param('id') id: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string
  ): Promise<{ success: boolean; data: any }> {
    const result = await this.reportsService.getRevenueLookup(id, { dateFrom, dateTo });
    return {
      success: true,
      data: result,
    };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('userId') userId: string
  ) {
    const updated = await this.reportsService.update(id, body, userId);
    return {
      success: true,
      message: 'Report metadata updated successfully',
      data: updated,
    };
  }

  @Delete('all')
  @Roles('ADMIN')
  async deleteAll(
    @Query('dealershipId') dealershipId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @CurrentUser('userId') userId: string
  ) {
    const result = await this.reportsService.deleteAll(userId, dealershipId, { dateFrom, dateTo });
    return {
      success: true,
      ...result,
    };
  }

  @Delete(':id')
  @Roles('ADMIN')
  async delete(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    const result = await this.reportsService.delete(id, userId);
    return {
      success: true,
      ...result,
    };
  }

  @Post(':id/duplicate')
  @Roles('ADMIN')
  async duplicate(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    const report = await this.reportsService.duplicate(id, userId);
    return {
      success: true,
      message: 'Report duplicated successfully',
      data: report,
    };
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param('id') id: string,
    @Query('templateId') templateId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Res() res: Response
  ) {
    const pdfBuffer = await this.reportsService.generatePdf(id, templateId, undefined, dateFrom, dateTo);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="DealerSocket_Report_${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  @Post(':id/pdf')
  async generateCustomPdf(
    @Param('id') id: string,
    @Body() body: { templateSettings?: any; dateFrom?: string; dateTo?: string },
    @Res() res: Response
  ) {
    const pdfBuffer = await this.reportsService.generatePdf(
      id,
      undefined,
      body.templateSettings,
      body.dateFrom,
      body.dateTo
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="DealerSocket_Report_${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  @Get(':id/export/csv')
  async exportCsv(@Param('id') id: string, @Res() res: Response) {
    const csvData = await this.reportsService.exportCsv(id);
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="DealerSocket_Report_${id}.csv"`,
    });
    res.send(csvData);
  }

  @Get(':id/export/xlsx')
  async exportXlsx(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.reportsService.exportXlsx(id);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="DealerSocket_Report_${id}.xlsx"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}
