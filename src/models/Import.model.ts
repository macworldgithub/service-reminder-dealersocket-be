import mongoose, { Document, Schema } from 'mongoose';

export type ImportStatus = 'PENDING' | 'ANALYZING' | 'MAPPED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface IValidationError {
  row: number;
  field: string;
  message: string;
  value?: any;
}

export interface IImport extends Document {
  dealershipId: mongoose.Types.ObjectId;
  uploadedBy: mongoose.Types.ObjectId;
  reportId?: mongoose.Types.ObjectId;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: ImportStatus;
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  skippedRows: number;
  duplicateCount: number;
  detectedHeaders: string[];
  sampleRows?: any[];
  mappingStatus: string;
  validationErrors: IValidationError[];
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ValidationErrorSchema = new Schema(
  {
    row: { type: Number, required: true },
    field: { type: String, required: true },
    message: { type: String, required: true },
    value: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const ImportSchema = new Schema<IImport>(
  {
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reportId: { type: Schema.Types.ObjectId, ref: 'Report' },
    fileName: { type: String, required: true },
    fileType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'ANALYZING', 'MAPPED', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    totalRows: { type: Number, default: 0 },
    successfulRows: { type: Number, default: 0 },
    failedRows: { type: Number, default: 0 },
    skippedRows: { type: Number, default: 0 },
    duplicateCount: { type: Number, default: 0 },
    detectedHeaders: [{ type: String }],
    sampleRows: [{ type: Schema.Types.Mixed }],
    mappingStatus: { type: String, default: 'UNMAPPED' },
    validationErrors: [ValidationErrorSchema],
    errorMessage: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

ImportSchema.index({ dealershipId: 1, createdAt: -1 });

export const Import = mongoose.model<IImport>('Import', ImportSchema);
