import mongoose, { Document, Schema } from 'mongoose';

export interface IColumnMapping extends Document {
  dealershipId: mongoose.Types.ObjectId;
  templateName?: string;
  reportType?: string;
  sourceColumn: string;
  targetField: string;
  dataType: 'string' | 'number' | 'currency' | 'date' | 'boolean';
  transformation: 'none' | 'trim' | 'uppercase' | 'lowercase' | 'parse_currency' | 'parse_date';
  isRequired: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ColumnMappingSchema = new Schema<IColumnMapping>(
  {
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true, index: true },
    templateName: { type: String, default: 'Default DealerSocket' },
    reportType: { type: String, default: 'DealerSocket Closed RO' },
    sourceColumn: { type: String, required: true, trim: true },
    targetField: { type: String, required: true, trim: true },
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
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

ColumnMappingSchema.index({ dealershipId: 1, sourceColumn: 1 });

export const ColumnMapping = mongoose.model<IColumnMapping>('ColumnMapping', ColumnMappingSchema);
