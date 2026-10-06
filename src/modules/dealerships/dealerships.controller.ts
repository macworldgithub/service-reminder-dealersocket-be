import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { DealershipsService } from './dealerships.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators';

@Controller('dealerships')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DealershipsController {
  constructor(private readonly dealershipsService: DealershipsService) {}

  @Get()
  async findAll(@Query('status') status?: string) {
    const data = await this.dealershipsService.findAll(status);
    return { success: true, data };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const data = await this.dealershipsService.findById(id);
    return { success: true, data };
  }

  @Post()
  @Roles('ADMIN')
  async create(@Body() body: any) {
    const data = await this.dealershipsService.create(body);
    return { success: true, message: 'Dealership created successfully', data };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(@Param('id') id: string, @Body() body: any) {
    const data = await this.dealershipsService.update(id, body);
    return { success: true, message: 'Dealership updated successfully', data };
  }
}
