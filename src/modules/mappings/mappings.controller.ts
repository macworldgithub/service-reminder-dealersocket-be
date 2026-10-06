import { Controller, Get, Put, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { MappingsService } from './mappings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, Roles } from '../../common/decorators';

@Controller('mappings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MappingsController {
  constructor(private readonly mappingsService: MappingsService) {}

  @Get()
  async getMappings(@Query('dealershipId') dealershipId: string) {
    const data = await this.mappingsService.findByDealership(dealershipId);
    return { success: true, data };
  }

  @Put()
  @Roles('ADMIN')
  async saveMappings(
    @Body('dealershipId') dealershipId: string,
    @Body('mappings') mappings: any[],
    @CurrentUser('userId') userId: string
  ) {
    const data = await this.mappingsService.saveMappings(dealershipId, mappings, userId);
    return {
      success: true,
      message: 'Column mappings updated successfully',
      data,
    };
  }

  @Delete(':id')
  @Roles('ADMIN')
  async deleteMapping(@Param('id') id: string) {
    const result = await this.mappingsService.deleteMapping(id);
    return { success: true, ...result };
  }
}
