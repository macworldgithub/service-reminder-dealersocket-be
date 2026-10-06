import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles('ADMIN')
  async getAuditLogs(
    @Query('dealershipId') dealershipId?: string,
    @Query('entityId') entityId?: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    const result = await this.auditService.getLogs({
      dealershipId,
      entityId,
      entityType,
      action,
      page,
      limit,
    });
    return {
      success: true,
      data: result.items,
      meta: result.meta,
    };
  }
}
