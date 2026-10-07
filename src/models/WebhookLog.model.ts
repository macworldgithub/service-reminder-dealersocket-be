import mongoose, { Document, Schema } from 'mongoose';

export type WebhookStatus = 'SUCCESS' | 'FAILED' | 'PING';

export interface IWebhookLog extends Document {
  dealershipId: mongoose.Types.ObjectId;
  eventType: string;
  sourceIp?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  reportId?: mongoose.Types.ObjectId;
  recordCount?: number;
  totalRevenue?: number;
  status: WebhookStatus;
  responseStatus: number;
  message?: string;
  payloadSummary?: Record<string, any>;
  isWebhook?: boolean;
  createdAt: Date;
}

const WebhookLogSchema = new Schema<IWebhookLog>(
  {
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true, index: true },
    eventType: { type: String, default: 'REPORT_INGEST', index: true },
    sourceIp: { type: String },
    fileName: { type: String },
    fileType: { type: String },
    fileSize: { type: Number },
    reportId: { type: Schema.Types.ObjectId, ref: 'Report' },
    recordCount: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    status: { type: String, enum: ['SUCCESS', 'FAILED', 'PING'], required: true, index: true },
    responseStatus: { type: Number, required: true },
    message: { type: String },
    payloadSummary: { type: Schema.Types.Mixed },
    isWebhook: { type: Boolean, default: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'auditlogs',
    autoIndex: false,
  }
);

export const WebhookLog = mongoose.model<IWebhookLog>('WebhookLog', WebhookLogSchema, 'auditlogs');
