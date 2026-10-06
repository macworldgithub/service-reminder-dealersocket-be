import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { IUser, UserRole, UserStatus } from '../../models/User.model';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel('User') private userModel: Model<IUser>,
    private auditService: AuditService
  ) {}

  async findAll() {
    return this.userModel
      .find()
      .select('-passwordHash')
      .populate('dealershipIds', 'name code')
      .sort({ createdAt: -1 })
      .lean();
  }

  async findById(id: string) {
    const user = await this.userModel
      .findById(id)
      .select('-passwordHash')
      .populate('dealershipIds', 'name code')
      .lean();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(
    data: {
      name: string;
      email: string;
      password: string;
      role?: UserRole;
      status?: UserStatus;
      dealershipIds?: string[];
    },
    adminUserId: string
  ) {
    const existing = await this.userModel.findOne({ email: data.email.toLowerCase() });
    if (existing) throw new BadRequestException('User with this email already exists');

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);

    let dealershipIds = data.dealershipIds;
    if (!dealershipIds || dealershipIds.length === 0) {
      const hyundai = await this.userModel.db.collection('dealerships').findOne({ code: 'SMH-01' });
      if (hyundai) dealershipIds = [hyundai._id.toString()];
    }

    const user = await this.userModel.create({
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash,
      role: 'ADMIN',
      status: data.status || 'ACTIVE',
      dealershipIds: (dealershipIds || []).map((id) => new Types.ObjectId(id)),
    });

    if (data.dealershipIds && data.dealershipIds[0]) {
      await this.auditService.log({
        dealershipId: data.dealershipIds[0],
        userId: adminUserId,
        entityType: 'User',
        entityId: user._id,
        action: 'USER_CREATED',
        after: { name: user.name, email: user.email, role: user.role },
      });
    }

    return this.findById(user._id.toString());
  }

  async update(id: string, data: Partial<IUser>, adminUserId: string) {
    const before = await this.userModel.findById(id).lean();
    if (!before) throw new NotFoundException('User not found');

    const updateFields: any = { ...data };
    if ((data as any).password) {
      const salt = await bcrypt.genSalt(10);
      updateFields.passwordHash = await bcrypt.hash((data as any).password, salt);
      delete updateFields.password;
    }

    const updated = await this.userModel
      .findByIdAndUpdate(id, updateFields, { new: true })
      .select('-passwordHash')
      .lean();

    if (before.dealershipIds && before.dealershipIds[0]) {
      await this.auditService.log({
        dealershipId: before.dealershipIds[0],
        userId: adminUserId,
        entityType: 'User',
        entityId: before._id,
        action: 'USER_UPDATED',
        before: { name: before.name, role: before.role, status: before.status },
        after: { name: updated?.name, role: updated?.role, status: updated?.status },
      });
    }

    return updated;
  }

  async delete(id: string) {
    const user = await this.userModel.findByIdAndDelete(id);
    if (!user) throw new NotFoundException('User not found');
    return { message: 'User deleted' };
  }
}
