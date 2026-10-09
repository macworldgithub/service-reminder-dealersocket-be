import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DealershipsController } from './dealerships.controller';
import { DealershipsService } from './dealerships.service';
import { Dealership } from '../../models/Dealership.model';
import { User } from '../../models/User.model';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Dealership', schema: Dealership.schema },
      { name: 'User', schema: User.schema },
    ]),
  ],
  controllers: [DealershipsController],
  providers: [DealershipsService],
  exports: [DealershipsService],
})
export class DealershipsModule {}
