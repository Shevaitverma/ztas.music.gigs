import { Schema, model, Document, Types } from 'mongoose';
import { ActivityAction, ActivityCategory, TargetType, UserRole } from '../../shared/enums';

/**
 * ActivityLog Interface
 * Tracks all user and system actions for audit purposes
 */
export interface ActivityLog extends Document {
  /** User who performed the action (null for system actions) */
  user?: Types.ObjectId;
  /** Role of the user at the time of action */
  userRole?: UserRole;
  /** IP address of the request */
  ipAddress?: string;
  /** User agent string */
  userAgent?: string;
  /** The action that was performed */
  action: ActivityAction;
  /** Category of the action */
  category: ActivityCategory;
  /** Type of entity affected (if any) */
  targetType?: TargetType;
  /** ID of the entity affected */
  targetId?: Types.ObjectId;
  /** Human-readable description of the action */
  description: string;
  /** Additional metadata about the action */
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * ActivityLog Schema
 */
const ActivityLogSchema = new Schema<ActivityLog>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    userRole: {
      type: String,
      enum: Object.values(UserRole),
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    action: {
      type: String,
      required: true,
      enum: Object.values(ActivityAction),
      index: true,
    },
    category: {
      type: String,
      required: true,
      enum: Object.values(ActivityCategory),
      index: true,
    },
    targetType: {
      type: String,
      enum: Object.values(TargetType),
    },
    targetId: {
      type: Schema.Types.ObjectId,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Indexes for efficient queries

// User activity lookup
ActivityLogSchema.index({ user: 1, createdAt: -1 });

// Action type lookup
ActivityLogSchema.index({ action: 1, createdAt: -1 });

// Category lookup
ActivityLogSchema.index({ category: 1, createdAt: -1 });

// Target entity lookup
ActivityLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

// TTL index: automatically delete logs after 90 days
ActivityLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 } // 90 days
);

/**
 * ActivityLog Model
 */
export const ActivityLogModel = model<ActivityLog>('ActivityLog', ActivityLogSchema);
