import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, Roles } from '../../common/decorators';

@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  async findAll(@Query('dealershipId') dealershipId?: string) {
    const data = await this.campaignsService.findAll(dealershipId);
    return { success: true, data };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const data = await this.campaignsService.findById(id);
    return { success: true, data };
  }

  @Post()
  @Roles('ADMIN')
  async create(@Body() body: any, @CurrentUser('userId') userId: string) {
    const data = await this.campaignsService.create(body, userId);
    return {
      success: true,
      message: 'Campaign created successfully',
      data,
    };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(@Param('id') id: string, @Body() body: any) {
    const data = await this.campaignsService.update(id, body);
    return {
      success: true,
      message: 'Campaign updated successfully',
      data,
    };
  }

  @Post(':id/execute')
  async execute(
    @Param('id') id: string,
    @Body('reportId') reportId?: string,
    @CurrentUser('userId') userId?: string
  ) {
    const data = await this.campaignsService.execute(id, reportId, userId);
    return {
      success: true,
      message: 'Campaign flow executed successfully',
      data,
    };
  }

  @Delete(':id')
  @Roles('ADMIN')
  async delete(@Param('id') id: string) {
    const data = await this.campaignsService.delete(id);
    return {
      success: true,
      ...data,
    };
  }
}
