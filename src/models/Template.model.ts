import mongoose, { Document, Schema } from 'mongoose';

export interface IPdfTemplateSettings {
  reportTitle: string;
  subtitle?: string;
  headerDealershipName?: string;
  campaignLabel?: string;
  dateRangeText?: string;
  primaryColor?: string;
  showSummaryMetrics?: boolean;
  columns: Array<{
    field: string;
    label: string;
    widthPercent?: number;
    visible: boolean;
  }>;
  footerNotes?: string;
}

export interface ITemplate extends Document {
  dealershipId: mongoose.Types.ObjectId;
  name: string;
  type: 'PDF' | 'SMS' | 'EMAIL' | 'VA_TASK';
  pdfSettings?: IPdfTemplateSettings;
  smsBody?: string;
  emailSubject?: string;
  emailBody?: string;
  vaTaskDescription?: string;
  availableVariables: string[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TemplateSchema = new Schema<ITemplate>(
  {
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['PDF', 'SMS', 'EMAIL', 'VA_TASK'], required: true },
    pdfSettings: {
      type: Schema.Types.Mixed,
      default: {
        reportTitle: 'Campaign Summary',
        subtitle: 'Service Detail',
        headerDealershipName: 'South Morang Hyundai',
        campaignLabel: 'HY Closed RO',
        dateRangeText: '9/28/2026 - 10/5/2026',
        primaryColor: '#0f172a',
        showSummaryMetrics: true,
        columns: [
          { field: 'externalEntityId', label: 'Entity ID', visible: true },
          { field: 'customerName', label: 'Customer Name', visible: true },
          { field: 'vehicle.year', label: 'Year', visible: true },
          { field: 'vehicle.model', label: 'Make/Model', visible: true },
          { field: 'campaignName', label: 'Campaign', visible: true },
          { field: 'eventNumber', label: 'Event#', visible: true },
          { field: 'closeDate', label: 'Close Date', visible: true },
          { field: 'roAmount', label: 'RO Amount', visible: true },
        ],
        footerNotes: 'Confidential DealerSocket Operations Report',
      },
    },
    smsBody: { type: String },
    emailSubject: { type: String },
    emailBody: { type: String },
    vaTaskDescription: { type: String },
    availableVariables: {
      type: [String],
      default: [
        'firstName',
        'customerName',
        'vehicleYear',
        'vehicleMake',
        'vehicleModel',
        'campaignName',
        'closeDate',
        'roAmount',
        'eventNumber',
        'entityId',
      ],
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const Template = mongoose.model<ITemplate>('Template', TemplateSchema);
