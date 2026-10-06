import mongoose, { Document, Schema } from 'mongoose';

export type ReportStatus = 'DRAFT' | 'PARSED' | 'MAPPED' | 'IMPORTED' | 'ARCHIVED' | 'FAILED';

export interface IColumnMappingItem {
  sourceColumn: string;
  targetField: string;
  dataType: 'string' | 'number' | 'currency' | 'date' | 'boolean';
  transformation?: 'none' | 'trim' | 'uppercase' | 'lowercase' | 'parse_currency' | 'parse_date';
  isRequired?: boolean;
}

export interface IReport extends Document {
  dealershipId: mongoose.Types.ObjectId;
  uploadedBy: mongoose.Types.ObjectId;
  name: string;
  sourceFileName: string;
  sourceFileType: string;
  sourceFileSize: number;
  campaignName?: string;
  reportType?: string;
  reportDateFrom?: Date;
  reportDateTo?: Date;
  recordCount: number;
  status: ReportStatus;
  columnMappings: IColumnMappingItem[];
  originalHeaders: string[];
  normalizedHeaders: string[];
  importId?: mongoose.Types.ObjectId;
  version: number;
  parentReportId?: mongoose.Types.ObjectId; // For version tracking
  createdAt: Date;
  updatedAt: Date;
}

const ColumnMappingItemSchema = new Schema(
  {
    sourceColumn: { type: String, required: true },
    targetField: { type: String, required: true },
    dataType: {
      type: String,
      enum: ['string', 'number', 'currency', 'date', 'boolean'],
      default: 'string',
    },
    transformation: {
      type: String,
      enum: ['none', 'trim', 'uppercase', 'lowercase', 'parse_currency', 'parse_date'],
      default: 'none',
    },
    isRequired: { type: Boolean, default: false },
  },
  { _id: false }
);

const ReportSchema = new Schema<IReport>(
  {
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    sourceFileName: { type: String, required: true },
    sourceFileType: { type: String, required: true },
    sourceFileSize: { type: Number, required: true },
    campaignName: { type: String, trim: true },
    reportType: { type: String, default: 'DealerSocket Closed RO' },
    reportDateFrom: { type: Date },
    reportDateTo: { type: Date },
    recordCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['DRAFT', 'PARSED', 'MAPPED', 'IMPORTED', 'ARCHIVED', 'FAILED'],
      default: 'DRAFT',
    },
    columnMappings: [ColumnMappingItemSchema],
    originalHeaders: [{ type: String }],
    normalizedHeaders: [{ type: String }],
    importId: { type: Schema.Types.ObjectId, ref: 'Import' },
    version: { type: Number, default: 1 },
    parentReportId: { type: Schema.Types.ObjectId, ref: 'Report' },
  },
  { timestamps: true }
);

ReportSchema.index({ dealershipId: 1, createdAt: -1 });
ReportSchema.index({ campaignName: 1 });
ReportSchema.index({ status: 1 });
ReportSchema.index({ parentReportId: 1, version: 1 });

export const Report = mongoose.model<IReport>('Report', ReportSchema);
