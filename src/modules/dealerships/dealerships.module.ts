import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DealershipsController } from './dealerships.controller';
import { DealershipsService } from './dealerships.service';
import { Dealership } from '../../models/Dealership.model';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Dealership', schema: Dealership.schema }]),
  ],
  controllers: [DealershipsController],
  providers: [DealershipsService],
  exports: [DealershipsService],
})
export class DealershipsModule {}
