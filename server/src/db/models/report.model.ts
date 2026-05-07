import { Schema, model, Document, Types } from 'mongoose';
import { ReportType, ReportStatus, ReportCategory } from '../../shared/enums';

/**
 * Report Interface
 * Represents a user report for issues on the platform
 */
export interface Report extends Document {
  /** Who is making the report */
  reporter: Types.ObjectId;
  /** Who/what is being reported */
  reported: {
    /** Type of entity being reported */
    entityType: 'USER' | 'GIG' | 'REVIEW' | 'BID' | 'APPLICATION';
    /** Reference to the entity */
    entityId: Types.ObjectId;
  };
  /** Category of the report */
  category: ReportCategory;
  /** Type/severity of the issue */
  type: ReportType;
  /** Detailed description of the issue */
  description: string;
  /** Supporting evidence (URLs to screenshots, etc.) */
  evidence?: string[];
  /** Current status of the report */
  status: ReportStatus;
  /** Priority level (calculated based on type and category) */
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** Admin assigned to handle this report */
  assignedTo?: Types.ObjectId;
  /** Admin resolution details */
  resolution?: {
    action: 'NO_ACTION' | 'WARNING' | 'CONTENT_REMOVED' | 'USER_SUSPENDED' | 'USER_BANNED';
    notes: string;
    resolvedBy: Types.ObjectId;
    resolvedAt: Date;
  };
  /** Internal notes for admin team */
  adminNotes?: string;
  /** Related reports (for tracking patterns) */
  relatedReports?: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Reported Entity Schema
 */
const ReportedEntitySchema = new Schema(
  {
    entityType: {
      type: String,
      required: true,
      enum: ['USER', 'GIG', 'REVIEW', 'BID', 'APPLICATION'],
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: 'reported.entityType',
    },
  },
  { _id: false }
);

/**
 * Resolution Schema
 */
const ResolutionSchema = new Schema(
  {
    action: {
      type: String,
      required: true,
      enum: ['NO_ACTION', 'WARNING', 'CONTENT_REMOVED', 'USER_SUSPENDED', 'USER_BANNED'],
    },
    notes: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    resolvedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

/**
 * Report Schema
 */
const ReportSchema = new Schema<Report>(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reported: {
      type: ReportedEntitySchema,
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: Object.values(ReportCategory),
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: Object.values(ReportType),
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 20,
      maxlength: 2000,
    },
    evidence: {
      type: [String],
      default: [],
      validate: [(v: string[]) => v.length <= 5, 'Max 5 evidence items'],
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(ReportStatus),
      default: ReportStatus.PENDING,
      index: true,
    },
    priority: {
      type: String,
      required: true,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    resolution: {
      type: ResolutionSchema,
    },
    adminNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    relatedReports: {
      type: [Schema.Types.ObjectId],
      ref: 'Report',
      default: [],
    },
  },
  { timestamps: true }
);

// Compound indexes
// Prevent duplicate reports from same user for same entity
ReportSchema.index(
  { reporter: 1, 'reported.entityType': 1, 'reported.entityId': 1 },
  { unique: true }
);

// Admin dashboard queries
ReportSchema.index({ status: 1, priority: -1, createdAt: -1 });

// Find reports for a specific entity
ReportSchema.index({ 'reported.entityType': 1, 'reported.entityId': 1 });

// Find reports by category and type for analytics
ReportSchema.index({ category: 1, type: 1, createdAt: -1 });

// Find reports assigned to an admin
ReportSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });

/**
 * Pre-save hook to calculate priority based on type and category
 */
ReportSchema.pre('save', function () {
  if (this.isNew || this.isModified('type') || this.isModified('category')) {
    // Calculate priority based on severity
    const criticalTypes = [
      ReportType.HARASSMENT,
      ReportType.FRAUD,
      ReportType.ILLEGAL_CONTENT,
      ReportType.SAFETY_CONCERN,
    ];
    const highTypes = [
      ReportType.SCAM,
      ReportType.IMPERSONATION,
      ReportType.INAPPROPRIATE_CONTENT,
    ];
    const mediumTypes = [
      ReportType.NO_SHOW,
      ReportType.UNPROFESSIONAL_BEHAVIOR,
      ReportType.FALSE_INFORMATION,
    ];

    if (criticalTypes.includes(this.type)) {
      this.priority = 'CRITICAL';
    } else if (highTypes.includes(this.type)) {
      this.priority = 'HIGH';
    } else if (mediumTypes.includes(this.type)) {
      this.priority = 'MEDIUM';
    } else {
      this.priority = 'LOW';
    }
  }
});

/**
 * Report Model
 */
export const ReportModel = model<Report>('Report', ReportSchema);
