import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RecordsService } from './records.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, Roles } from '../../common/decorators';
import { RecordStatus } from '../../models/ReportRecord.model';

@Controller('reports/:reportId/records')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Get()
  async findRecords(
    @Param('reportId') reportId: string,
    @Query('search') search?: string,
    @Query('recordStatus') recordStatus?: RecordStatus,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    const result = await this.recordsService.findRecords(reportId, {
      search,
      recordStatus,
      sortBy,
      sortOrder,
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

  @Get(':recordId')
  async findRecordById(
    @Param('reportId') reportId: string,
    @Param('recordId') recordId: string
  ) {
    const data = await this.recordsService.findRecordById(reportId, recordId);
    return {
      success: true,
      data,
    };
  }

  @Post()
  @Roles('ADMIN')
  async createRecord(
    @Param('reportId') reportId: string,
    @Body() body: any,
    @CurrentUser('userId') userId: string
  ) {
    const record = await this.recordsService.createRecord(reportId, body, userId);
    return {
      success: true,
      message: 'Record created successfully',
      data: record,
    };
  }

  @Patch(':recordId')
  @Roles('ADMIN')
  async updateRecord(
    @Param('reportId') reportId: string,
    @Param('recordId') recordId: string,
    @Body() body: any,
    @CurrentUser('userId') userId: string
  ) {
    const updated = await this.recordsService.updateRecord(reportId, recordId, body, userId);
    return {
      success: true,
      message: 'Record updated successfully',
      data: updated,
    };
  }

  @Delete(':recordId')
  @Roles('ADMIN')
  async deleteRecord(
    @Param('reportId') reportId: string,
    @Param('recordId') recordId: string,
    @CurrentUser('userId') userId: string
  ) {
    const result = await this.recordsService.deleteRecord(reportId, recordId, userId);
    return {
      success: true,
      ...result,
    };
  }

  @Post('bulk-delete')
  @Roles('ADMIN')
  async bulkDelete(
    @Param('reportId') reportId: string,
    @Body('recordIds') recordIds: string[],
    @CurrentUser('userId') userId: string
  ) {
    const result = await this.recordsService.bulkDelete(reportId, recordIds, userId);
    return {
      success: true,
      message: `Deleted ${result.deletedCount} records`,
      data: result,
    };
  }

  @Post('bulk-status')
  @Roles('ADMIN')
  async bulkUpdateStatus(
    @Param('reportId') reportId: string,
    @Body('recordIds') recordIds: string[],
    @Body('status') status: RecordStatus,
    @CurrentUser('userId') userId: string
  ) {
    const result = await this.recordsService.bulkUpdateStatus(reportId, recordIds, status, userId);
    return {
      success: true,
      message: `Updated status for ${result.modifiedCount} records`,
      data: result,
    };
  }

  @Post('populate-emails')
  @Roles('ADMIN')
  async populateEmails(
    @Param('reportId') reportId: string,
    @CurrentUser('userId') userId: string
  ) {
    const result = await this.recordsService.populateMissingEmails(reportId, userId);
    return {
      success: true,
      message: `Populated customer emails for ${result.modifiedCount} records`,
      data: result,
    };
  }
}
