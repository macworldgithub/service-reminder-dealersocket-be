import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, Roles } from '../../common/decorators';

@Controller('templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  async findAll(@Query('dealershipId') dealershipId?: string, @Query('type') type?: string) {
    const data = await this.templatesService.findAll(dealershipId, type);
    return { success: true, data };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const data = await this.templatesService.findById(id);
    return { success: true, data };
  }

  @Post()
  @Roles('ADMIN')
  async create(@Body() body: any, @CurrentUser('userId') userId: string) {
    const data = await this.templatesService.create(body, userId);
    return {
      success: true,
      message: 'Template created successfully',
      data,
    };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser('userId') userId: string) {
    const data = await this.templatesService.update(id, body, userId);
    return {
      success: true,
      message: 'Template updated successfully',
      data,
    };
  }

  @Delete(':id')
  @Roles('ADMIN')
  async delete(@Param('id') id: string) {
    const result = await this.templatesService.delete(id);
    return { success: true, ...result };
  }
}
