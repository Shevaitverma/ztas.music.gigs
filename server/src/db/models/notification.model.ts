import { Schema, model, Document, Types } from 'mongoose';

/**
 * Notification types
 */
export enum NotificationType {
  EVENT_REMINDER_24H = 'EVENT_REMINDER_24H',
  EVENT_REMINDER_2H = 'EVENT_REMINDER_2H',
  GIG_AUTO_CLOSED = 'GIG_AUTO_CLOSED',
  GIG_AUTO_COMPLETED = 'GIG_AUTO_COMPLETED',
  BID_ACCEPTED = 'BID_ACCEPTED',
  BID_REJECTED = 'BID_REJECTED',
  BID_OUTBID = 'BID_OUTBID',
  NEW_BID = 'NEW_BID',
}

/**
 * Notification Interface
 */
export interface Notification extends Document {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  /**
   * Arbitrary structured payload (gigId, bidId, etc.). Stored as Mixed.
   *
   * WARNING: this field is NOT validated. Treat it as untrusted at read time:
   * never feed values from `data.*` into Mongo queries or HTML without
   * sanitizing/typing. Producers should populate it from server-trusted
   * sources only (no client passthrough).
   */
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Notification Schema
 */
const NotificationSchema = new Schema<Notification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: Object.values(NotificationType),
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    data: { type: Schema.Types.Mixed },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Compound indexes
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });

/**
 * Notification Model
 */
export const NotificationModel = model<Notification>('Notification', NotificationSchema);
