import { Schema, model, Document, Types } from 'mongoose';
import { ApplicationStatus } from '../../shared/enums';

/**
 * Application Interface
 */
export interface Application extends Document {
  gig: Types.ObjectId;
  applicant: Types.ObjectId;
  bidAmount: number;
  proposal: string;
  status: ApplicationStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Application Schema
 */
const ApplicationSchema = new Schema<Application>(
  {
    gig: { type: Schema.Types.ObjectId, ref: 'Gig', required: true, index: true },
    applicant: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bidAmount: { type: Number, required: true, min: 0 },
    proposal: { type: String, required: true, trim: true, maxlength: 2000 },
    status: {
      type: String,
      required: true,
      enum: Object.values(ApplicationStatus),
      default: ApplicationStatus.PENDING,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound index to prevent duplicate applications from same artist to same gig
ApplicationSchema.index({ gig: 1, applicant: 1 }, { unique: true });
ApplicationSchema.index({ gig: 1, status: 1 });

/**
 * Application Model
 */
export const ApplicationModel = model<Application>('Application', ApplicationSchema);
