import mongoose, { Document, Schema } from 'mongoose';

export type DealershipStatus = 'ACTIVE' | 'INACTIVE';

export interface IDealership extends Document {
  name: string;
  code: string;
  timezone: string;
  status: DealershipStatus;
  settings: {
    autoDetectHeaders?: boolean;
    defaultReportType?: string;
    duplicateDetectionKeys?: string[];
    allowedFileTypes?: string[];
    webhookApiKey?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const DealershipSchema = new Schema<IDealership>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    timezone: { type: String, default: 'Australia/Melbourne' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    settings: {
      type: Schema.Types.Mixed,
      default: {
        autoDetectHeaders: true,
        duplicateDetectionKeys: ['externalEntityId', 'eventNumber'],
        allowedFileTypes: ['csv', 'xlsx', 'xls', 'pdf'],
      },
    },
  },
  { timestamps: true }
);



export const Dealership = mongoose.model<IDealership>('Dealership', DealershipSchema);
