import mongoose, { Document, Schema } from 'mongoose';

export interface ICampaignStep {
  stepNumber: number;
  channel: 'SMS' | 'EMAIL' | 'VA_TASK';
  delayDays: number;
  templateId?: mongoose.Types.ObjectId;
  description: string;
}

export interface ICampaign extends Document {
  dealershipId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  triggerType: 'CLOSED_RO' | 'SERVICE_DUE' | 'MANUAL';
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  steps: ICampaignStep[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignStepSchema = new Schema(
  {
    stepNumber: { type: Number, required: true },
    channel: { type: String, enum: ['SMS', 'EMAIL', 'VA_TASK'], required: true },
    delayDays: { type: Number, default: 0 },
    templateId: { type: Schema.Types.ObjectId, ref: 'Template' },
    description: { type: String },
  },
  { _id: false }
);

const CampaignSchema = new Schema<ICampaign>(
  {
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    triggerType: {
      type: String,
      enum: ['CLOSED_RO', 'SERVICE_DUE', 'MANUAL'],
      default: 'CLOSED_RO',
    },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'],
      default: 'ACTIVE',
    },
    steps: [CampaignStepSchema],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

CampaignSchema.index({ dealershipId: 1, status: 1 });

export const Campaign = mongoose.model<ICampaign>('Campaign', CampaignSchema);
