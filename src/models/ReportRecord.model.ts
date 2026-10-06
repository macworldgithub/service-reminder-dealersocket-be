import mongoose, { Document, Schema } from 'mongoose';

export type RecordStatus = 'VALID' | 'WARNING' | 'ERROR';

export interface IVehicle {
  year?: number;
  make?: string;
  model?: string;
}

export interface IReportRecord extends Document {
  reportId: mongoose.Types.ObjectId;
  dealershipId: mongoose.Types.ObjectId;
  externalEntityId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  vehicle: IVehicle;
  campaignName?: string;
  campaignInsertDate?: Date;
  eventNumber?: string;
  closeDate?: Date;
  roAmount?: number;
  customFields: Record<string, any>;
  sourceData: Record<string, any>;
  recordStatus: RecordStatus;
  validationNotes?: string[];
  lastEditedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ReportRecordSchema = new Schema<IReportRecord>(
  {
    reportId: { type: Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true, index: true },
    externalEntityId: { type: String, trim: true, index: true },
    customerName: { type: String, trim: true },
    customerEmail: { type: String, trim: true, lowercase: true },
    customerPhone: { type: String, trim: true },
    vehicle: {
      year: { type: Number },
      make: { type: String, trim: true },
      model: { type: String, trim: true },
    },
    campaignName: { type: String, trim: true },
    campaignInsertDate: { type: Date },
    eventNumber: { type: String, trim: true, index: true },
    closeDate: { type: Date },
    roAmount: { type: Number },
    customFields: { type: Schema.Types.Mixed, default: {} },
    sourceData: { type: Schema.Types.Mixed, required: true },
    recordStatus: {
      type: String,
      enum: ['VALID', 'WARNING', 'ERROR'],
      default: 'VALID',
      index: true,
    },
    validationNotes: [{ type: String }],
    lastEditedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Compound indexes for fast querying & duplicate checking
ReportRecordSchema.index({ reportId: 1, createdAt: -1 });
ReportRecordSchema.index({ dealershipId: 1, externalEntityId: 1 });
ReportRecordSchema.index({ dealershipId: 1, eventNumber: 1 });
ReportRecordSchema.index({ dealershipId: 1, closeDate: -1 });

export const ReportRecord = mongoose.model<IReportRecord>('ReportRecord', ReportRecordSchema);
