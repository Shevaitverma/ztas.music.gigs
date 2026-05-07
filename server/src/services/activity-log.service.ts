import { ActivityLogModel, ActivityLog } from '../db/models';
import { ActivityAction, ActivityCategory, TargetType, UserRole } from '../shared/enums';
import { config } from '../config';

/**
 * Parameters for logging an activity
 */
export interface LogActivityParams {
  /** User ID who performed the action */
  userId?: string;
  /** Role of the user */
  userRole?: UserRole;
  /** IP address of the request */
  ipAddress?: string;
  /** User agent string */
  userAgent?: string;
  /** The action that was performed */
  action: ActivityAction;
  /** Category of the action */
  category: ActivityCategory;
  /** Type of entity affected */
  targetType?: TargetType;
  /** ID of the entity affected */
  targetId?: string;
  /** Human-readable description */
  description: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for searching activity logs
 */
export interface SearchActivityLogsParams {
  userId?: string;
  action?: ActivityAction;
  category?: ActivityCategory;
  targetType?: TargetType;
  targetId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

/**
 * Activity log response
 */
export interface ActivityLogResponse {
  id: string;
  user?: string;
  userRole?: UserRole;
  ipAddress?: string;
  action: ActivityAction;
  category: ActivityCategory;
  targetType?: TargetType;
  targetId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Paginated activity log response
 */
export interface PaginatedActivityLogs {
  data: ActivityLogResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Activity Log Service
 * Singleton service for logging user and system activities
 */
class ActivityLogService {
  /**
   * Check if activity logging is enabled
   */
  isEnabled(): boolean {
    return config.features.activityLogging;
  }

  /**
   * Log an activity (fire-and-forget)
   * This method is async but does not need to be awaited
   * Logging is controlled by ENABLE_ACTIVITY_LOGGING env variable.
   *
   * If `params.metadata?.force === true`, the log is written even when the
   * feature flag is off. This is for audit-critical events (admin actions
   * against users, etc.) where the audit trail must always exist.
   */
  log(params: LogActivityParams): void {
    const force = params.metadata?.force === true;
    if (!this.isEnabled() && !force) {
      return;
    }

    // Fire and forget - don't await
    this.saveLog(params).catch((error) => {
      console.error('[ActivityLog] Failed to save activity log:', error);
    });
  }

  /**
   * Save the log entry
   */
  private async saveLog(params: LogActivityParams): Promise<void> {
    const log = new ActivityLogModel({
      user: params.userId,
      userRole: params.userRole,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent?.substring(0, 500), // Truncate user agent
      action: params.action,
      category: params.category,
      targetType: params.targetType,
      targetId: params.targetId,
      description: params.description,
      metadata: params.metadata,
    });

    await log.save();
  }

  /**
   * Search activity logs (Admin)
   */
  async searchLogs(params: SearchActivityLogsParams): Promise<PaginatedActivityLogs> {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (params.userId) filter.user = params.userId;
    if (params.action) filter.action = params.action;
    if (params.category) filter.category = params.category;
    if (params.targetType) filter.targetType = params.targetType;
    if (params.targetId) filter.targetId = params.targetId;

    if (params.startDate || params.endDate) {
      filter.createdAt = {};
      if (params.startDate) {
        (filter.createdAt as Record<string, Date>).$gte = params.startDate;
      }
      if (params.endDate) {
        (filter.createdAt as Record<string, Date>).$lte = params.endDate;
      }
    }

    const [logs, total] = await Promise.all([
      ActivityLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      ActivityLogModel.countDocuments(filter).exec(),
    ]);

    return {
      data: logs.map((log) => this.transformLogResponse(log)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user activity history
   */
  async getUserActivity(
    userId: string,
    limit: number = 50
  ): Promise<ActivityLogResponse[]> {
    const logs = await ActivityLogModel.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return logs.map((log) => this.transformLogResponse(log));
  }

  /**
   * Get activity for a specific entity
   */
  async getEntityActivity(
    targetType: TargetType,
    targetId: string,
    limit: number = 50
  ): Promise<ActivityLogResponse[]> {
    const logs = await ActivityLogModel.find({ targetType, targetId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return logs.map((log) => this.transformLogResponse(log));
  }

  /**
   * Transform log document to response
   */
  private transformLogResponse(log: ActivityLog): ActivityLogResponse {
    return {
      id: log._id.toString(),
      user: log.user?.toString(),
      userRole: log.userRole,
      ipAddress: log.ipAddress,
      action: log.action,
      category: log.category,
      targetType: log.targetType,
      targetId: log.targetId?.toString(),
      description: log.description,
      metadata: log.metadata,
      createdAt: log.createdAt,
    };
  }
}

// Export singleton instance
export const activityLogService = new ActivityLogService();

// Also export the class for testing
export { ActivityLogService };
