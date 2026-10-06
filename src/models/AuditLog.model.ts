import mongoose, { Document, Schema } from 'mongoose';

export type AuditAction =
  | 'REPORT_UPLOADED'
  | 'REPORT_EDITED'
  | 'REPORT_DELETED'
  | 'RECORD_CREATED'
  | 'RECORD_UPDATED'
  | 'RECORD_DELETED'
  | 'COLUMN_MAPPING_UPDATED'
  | 'IMPORT_STARTED'
  | 'IMPORT_COMPLETED'
  | 'IMPORT_FAILED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'PDF_TEMPLATE_UPDATED';

export interface IAuditLog extends Document {
  dealershipId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  entityType: 'Report' | 'ReportRecord' | 'Import' | 'ColumnMapping' | 'User' | 'Dealership';
  entityId: mongoose.Types.ObjectId;
  action: AuditAction;
  before?: any;
  after?: any;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    entityType: {
      type: String,
      required: true,
      enum: ['Report', 'ReportRecord', 'Import', 'ColumnMapping', 'User', 'Dealership'],
    },
    entityId: { type: Schema.Types.ObjectId, required: true },
    action: {
      type: String,
      required: true,
      enum: [
        'REPORT_UPLOADED',
        'REPORT_EDITED',
        'REPORT_DELETED',
        'RECORD_CREATED',
        'RECORD_UPDATED',
        'RECORD_DELETED',
        'COLUMN_MAPPING_UPDATED',
        'IMPORT_STARTED',
        'IMPORT_COMPLETED',
        'IMPORT_FAILED',
        'USER_CREATED',
        'USER_UPDATED',
        'PDF_TEMPLATE_UPDATED',
      ],
      index: true,
    },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ dealershipId: 1, createdAt: -1 });
AuditLogSchema.index({ entityId: 1, createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
