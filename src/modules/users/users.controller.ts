import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, Roles } from '../../common/decorators';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('ADMIN')
  async findAll() {
    const data = await this.usersService.findAll();
    return { success: true, data };
  }

  @Get(':id')
  @Roles('ADMIN')
  async findById(@Param('id') id: string) {
    const data = await this.usersService.findById(id);
    return { success: true, data };
  }

  @Post()
  @Roles('ADMIN')
  async create(@Body() body: any, @CurrentUser('userId') adminUserId: string) {
    const user = await this.usersService.create(body, adminUserId);
    return {
      success: true,
      message: 'User created successfully',
      data: user,
    };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('userId') adminUserId: string
  ) {
    const updated = await this.usersService.update(id, body, adminUserId);
    return {
      success: true,
      message: 'User updated successfully',
      data: updated,
    };
  }

  @Delete(':id')
  @Roles('ADMIN')
  async delete(@Param('id') id: string) {
    const res = await this.usersService.delete(id);
    return { success: true, ...res };
  }
}
