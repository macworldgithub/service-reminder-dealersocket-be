import mongoose, { Document, Schema } from 'mongoose';

export type UserRole = 'ADMIN';
export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  dealershipIds: mongoose.Types.ObjectId[];
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN'], default: 'ADMIN' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    dealershipIds: [{ type: Schema.Types.ObjectId, ref: 'Dealership' }],
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);



export const User = mongoose.model<IUser>('User', UserSchema);
