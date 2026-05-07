import {
  UserModel,
  GigModel,
  ApplicationModel,
  BidModel,
  VenueModel,
  EventCheckInModel,
  ReportModel,
} from '../../db/models';
import { NotFoundException, BadRequestException } from '../../plugins/error.plugin';
import {
  UserStatus,
  GigStatus,
  UserRole,
  GigCategory,
  CheckInStatus,
  BidStatus,
  ReportStatus,
  ActivityAction,
  ActivityCategory,
  TargetType,
  AdminRole,
} from '../../shared/enums';
import { ForbiddenException } from '../../plugins/error.plugin';
import { escapeRegex } from '../../shared/utils/validation.utils';
import { activityLogService } from '../../services/activity-log.service';

/**
 * Query filters for user listing
 */
export interface UserFilters {
  page?: number;
  limit?: number;
  role?: UserRole;
  status?: UserStatus;
  search?: string;
  isVerified?: boolean;
}

/**
 * Query filters for gig listing
 */
export interface GigFilters {
  page?: number;
  limit?: number;
  status?: GigStatus;
  category?: GigCategory;
  search?: string;
  city?: string;
}

/**
 * Analytics period type
 */
export type AnalyticsPeriod = 'day' | 'week' | 'month' | 'year';

/**
 * Admin Service
 */
export class AdminService {
  /**
   * Get Dashboard Stats
   */
  async getDashboardStats() {
    const [
      totalUsers,
      activeUsers,
      totalGigs,
      liveGigs,
      bookedGigs,
      completedGigs,
      totalApplications,
      totalBids,
      acceptedBids,
      totalVenues,
      totalCheckIns,
      completedCheckIns,
      pendingReports,
    ] = await Promise.all([
      UserModel.countDocuments(),
      UserModel.countDocuments({ status: UserStatus.ACTIVE }),
      GigModel.countDocuments(),
      GigModel.countDocuments({ status: GigStatus.LIVE }),
      GigModel.countDocuments({ status: GigStatus.BOOKED }),
      GigModel.countDocuments({ status: GigStatus.COMPLETED }),
      ApplicationModel.countDocuments(),
      BidModel.countDocuments(),
      BidModel.countDocuments({ status: BidStatus.ACCEPTED }),
      VenueModel.countDocuments(),
      EventCheckInModel.countDocuments(),
      EventCheckInModel.countDocuments({ status: CheckInStatus.EVENT_ENDED }),
      ReportModel.countDocuments({ status: ReportStatus.PENDING }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
      },
      gigs: {
        total: totalGigs,
        live: liveGigs,
        booked: bookedGigs,
        completed: completedGigs,
      },
      activity: {
        applications: totalApplications,
        bids: totalBids,
        acceptedBids,
        venues: totalVenues,
      },
      checkIns: {
        total: totalCheckIns,
        completed: completedCheckIns,
      },
      moderation: {
        pendingReports,
      },
    };
  }

  /**
   * Get Recent Activity
   */
  async getRecentActivity() {
    const users = await UserModel.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name role createdAt');

    const gigs = await GigModel.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title status createdAt');

    return {
      recentUsers: users.map(user => ({
        id: user._id.toString(),
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      })),
      recentGigs: gigs.map(gig => ({
        id: gig._id.toString(),
        title: gig.title,
        status: gig.status,
        createdAt: gig.createdAt,
      })),
    };
  }

  /**
   * Update User Status.
   *
   * SECURITY (H2):
   * - Admins cannot change their own status (no self-ban / self-unban).
   * - Only SUPER_ADMIN can change another admin's status.
   * - Activity log is force-emitted (independent of feature flag) so the audit
   *   trail for admin-on-admin actions always exists.
   */
  async updateUserStatus(
    userId: string,
    status: UserStatus,
    reason: string | undefined,
    adminId: string,
    adminRole?: AdminRole | null
  ) {
    if (!adminId) {
      throw new ForbiddenException('Admin context required for this action');
    }
    if (adminId === userId) {
      throw new ForbiddenException('Admins cannot change their own status');
    }

    const user = await UserModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');

    if (user.role === UserRole.ADMIN && adminRole !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can modify another admin\'s status'
      );
    }

    const previousStatus = user.status;
    user.status = status;
    if (reason) user.statusReason = reason;
    await user.save();

    // Log the admin action
    let action: ActivityAction;
    if (status === UserStatus.BANNED) {
      action = ActivityAction.USER_BANNED;
    } else if (status === UserStatus.SUSPENDED) {
      action = ActivityAction.USER_SUSPENDED;
    } else if (previousStatus === UserStatus.BANNED || previousStatus === UserStatus.SUSPENDED) {
      action = ActivityAction.USER_UNBANNED;
    } else {
      action = ActivityAction.PROFILE_UPDATED;
    }

    // Force the activity log for admin status mutations regardless of the
    // ENABLE_ACTIVITY_LOGGING feature flag — these are audit-critical.
    activityLogService.log({
      userId: adminId,
      action,
      category: ActivityCategory.ADMIN,
      targetType: TargetType.USER,
      targetId: userId,
      description: `User status changed from ${previousStatus} to ${status}`,
      metadata: { reason, previousStatus, newStatus: status, force: true },
    });

    return {
      id: user._id.toString(),
      status: user.status,
      statusReason: user.statusReason,
    };
  }

  /**
   * Verify User.
   *
   * SECURITY (H2): same self/cross-admin protections as
   * {@link updateUserStatus}.
   */
  async verifyUser(
    userId: string,
    isVerified: boolean,
    adminId: string,
    adminRole?: AdminRole | null
  ) {
    if (!adminId) {
      throw new ForbiddenException('Admin context required for this action');
    }
    if (adminId === userId) {
      throw new ForbiddenException('Admins cannot toggle their own verification');
    }

    const user = await UserModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');

    if (user.role === UserRole.ADMIN && adminRole !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can modify another admin\'s verification'
      );
    }

    const wasVerified = user.isVerified;
    user.isVerified = isVerified;
    await user.save();

    // Force the activity log (audit-critical).
    activityLogService.log({
      userId: adminId,
      action: ActivityAction.USER_VERIFIED,
      category: ActivityCategory.ADMIN,
      targetType: TargetType.USER,
      targetId: userId,
      description: isVerified
        ? 'User verification approved'
        : 'User verification revoked',
      metadata: { wasVerified, isVerified, force: true },
    });

    return {
      id: user._id.toString(),
      isVerified: user.isVerified,
    };
  }

  /**
   * Get Users with pagination and filters
   */
  async getUsers(filters: UserFilters) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    if (filters.role) {
      query.role = filters.role;
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.isVerified !== undefined) {
      query.isVerified = filters.isVerified;
    }
    if (filters.search) {
      const safeSearch = escapeRegex(filters.search);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      UserModel.find(query)
        .select('-firebaseUid')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      UserModel.countDocuments(query).exec(),
    ]);

    return {
      data: users.map((user) => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status,
        isVerified: user.isVerified,
        profilePicture: user.profilePicture,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get Gigs with pagination and filters
   */
  async getGigs(filters: GigFilters) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.category) {
      query.category = filters.category;
    }
    if (filters.city) {
      const safeCity = escapeRegex(filters.city);
      query['venue.city'] = { $regex: safeCity, $options: 'i' };
    }
    if (filters.search) {
      const safeSearch = escapeRegex(filters.search);
      query.$or = [
        { title: { $regex: safeSearch, $options: 'i' } },
        { description: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    // SECURITY (H9): default admin listing populates only `name`. The full
    // export endpoint (gated behind EXPORT_DATA permission) is the place to
    // pull email/phone if needed.
    const [gigs, total] = await Promise.all([
      GigModel.find(query)
        .populate('postedBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      GigModel.countDocuments(query).exec(),
    ]);

    return {
      data: gigs.map((gig) => ({
        id: gig._id.toString(),
        title: gig.title,
        status: gig.status,
        category: gig.category,
        venue: gig.venue,
        eventTiming: gig.eventTiming,
        budget: gig.budget,
        postedBy: gig.postedBy,
        createdAt: gig.createdAt,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get Analytics Dashboard
   */
  async getAnalyticsDashboard(period: AnalyticsPeriod = 'month') {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
    }

    const dateFilter = { createdAt: { $gte: startDate } };

    const [
      newUsers,
      newGigs,
      newBids,
      newApplications,
      completedGigs,
      usersByRole,
      gigsByStatus,
      gigsByCategory,
    ] = await Promise.all([
      UserModel.countDocuments(dateFilter),
      GigModel.countDocuments(dateFilter),
      BidModel.countDocuments(dateFilter),
      ApplicationModel.countDocuments(dateFilter),
      GigModel.countDocuments({
        ...dateFilter,
        status: GigStatus.COMPLETED,
      }),
      UserModel.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
      GigModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      GigModel.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
    ]);

    return {
      period,
      startDate,
      endDate: now,
      newUsers,
      newGigs,
      newBids,
      newApplications,
      completedGigs,
      usersByRole: usersByRole.reduce(
        (acc, item) => ({ ...acc, [item._id]: item.count }),
        {}
      ),
      gigsByStatus: gigsByStatus.reduce(
        (acc, item) => ({ ...acc, [item._id]: item.count }),
        {}
      ),
      gigsByCategory: gigsByCategory.reduce(
        (acc, item) => ({ ...acc, [item._id]: item.count }),
        {}
      ),
    };
  }

  /**
   * Get User Analytics
   */
  async getUsersAnalytics() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      verifiedUsers,
      signupsLast7Days,
      signupsLast30Days,
      usersByRole,
      usersByStatus,
    ] = await Promise.all([
      UserModel.countDocuments(),
      UserModel.countDocuments({ status: UserStatus.ACTIVE }),
      UserModel.countDocuments({ isVerified: true }),
      UserModel.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      UserModel.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      UserModel.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
      UserModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    return {
      overview: {
        total: totalUsers,
        active: activeUsers,
        verified: verifiedUsers,
        verificationRate: totalUsers > 0 ? (verifiedUsers / totalUsers) * 100 : 0,
      },
      signups: {
        last7Days: signupsLast7Days,
        last30Days: signupsLast30Days,
      },
      byRole: usersByRole.reduce(
        (acc, item) => ({ ...acc, [item._id]: item.count }),
        {}
      ),
      byStatus: usersByStatus.reduce(
        (acc, item) => ({ ...acc, [item._id]: item.count }),
        {}
      ),
    };
  }

  /**
   * Get Gigs Analytics
   */
  async getGigsAnalytics() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalGigs,
      gigsLast30Days,
      gigsByStatus,
      gigsByCategory,
      avgBidsPerGig,
      topCities,
    ] = await Promise.all([
      GigModel.countDocuments(),
      GigModel.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      GigModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      GigModel.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      BidModel.aggregate([
        { $group: { _id: '$gig', count: { $sum: 1 } } },
        { $group: { _id: null, avgBids: { $avg: '$count' } } },
      ]),
      GigModel.aggregate([
        { $group: { _id: '$venue.city', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const completedGigs = gigsByStatus.find(
      (s) => s._id === GigStatus.COMPLETED
    )?.count || 0;

    return {
      overview: {
        total: totalGigs,
        last30Days: gigsLast30Days,
        completionRate: totalGigs > 0 ? (completedGigs / totalGigs) * 100 : 0,
        avgBidsPerGig: avgBidsPerGig[0]?.avgBids || 0,
      },
      byStatus: gigsByStatus.reduce(
        (acc, item) => ({ ...acc, [item._id]: item.count }),
        {}
      ),
      byCategory: gigsByCategory.reduce(
        (acc, item) => ({ ...acc, [item._id]: item.count }),
        {}
      ),
      topCities: topCities.map((city) => ({
        city: city._id || 'Unknown',
        count: city.count,
      })),
    };
  }

  /**
   * Get Storage Statistics
   * Note: This provides database-level storage metrics.
   * For S3 storage, you would need to implement S3 listing API.
   */
  async getStorageStats() {
    // Count files by type from database records
    const [
      profilePictures,
      audioSamples,
      verificationDocs,
    ] = await Promise.all([
      UserModel.countDocuments({ profilePicture: { $exists: true, $ne: null } }),
      UserModel.aggregate([
        { $match: { 'artistProfile.audioSamples': { $exists: true } } },
        { $project: { count: { $size: { $ifNull: ['$artistProfile.audioSamples', []] } } } },
        { $group: { _id: null, total: { $sum: '$count' } } },
      ]),
      // Placeholder for verification documents count
      Promise.resolve([{ total: 0 }]),
    ]);

    return {
      database: {
        profilePictures,
        audioSamples: audioSamples[0]?.total || 0,
        verificationDocs: verificationDocs[0]?.total || 0,
      },
      // S3 stats would require ListObjectsV2 command implementation
      s3: {
        note: 'S3 storage statistics require additional API implementation',
        available: false,
      },
    };
  }

  /**
   * Export Data as JSON
   * Includes mandatory limits to prevent memory exhaustion
   */
  async exportData(
    type: 'users' | 'gigs' | 'bids' | 'applications',
    filters?: Record<string, unknown>,
    requestedLimit?: number
  ) {
    // Validate export type
    const validTypes = ['users', 'gigs', 'bids', 'applications'];
    if (!validTypes.includes(type)) {
      throw new BadRequestException(
        `Invalid export type: "${type}". Valid types are: ${validTypes.join(', ')}`
      );
    }

    // Enforce maximum export limit to prevent memory issues
    const MAX_EXPORT_LIMIT = 10000;
    const DEFAULT_LIMIT = 1000;
    const limit = Math.min(requestedLimit || DEFAULT_LIMIT, MAX_EXPORT_LIMIT);

    let data: unknown[];
    let totalCount: number;

    switch (type) {
      case 'users':
        [data, totalCount] = await Promise.all([
          UserModel.find(filters || {})
            .select('-firebaseUid -password -refreshToken')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean()
            .exec(),
          UserModel.countDocuments(filters || {}),
        ]);
        break;
      case 'gigs':
        [data, totalCount] = await Promise.all([
          GigModel.find(filters || {})
            .populate('postedBy', 'name email')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean()
            .exec(),
          GigModel.countDocuments(filters || {}),
        ]);
        break;
      case 'bids':
        [data, totalCount] = await Promise.all([
          BidModel.find(filters || {})
            .populate('artist', 'name email')
            .populate('gig', 'title')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean()
            .exec(),
          BidModel.countDocuments(filters || {}),
        ]);
        break;
      case 'applications':
        [data, totalCount] = await Promise.all([
          ApplicationModel.find(filters || {})
            .populate('artist', 'name email')
            .populate('gig', 'title')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean()
            .exec(),
          ApplicationModel.countDocuments(filters || {}),
        ]);
        break;
      default:
        throw new BadRequestException(`Unknown export type: ${type}`);
    }

    return {
      type,
      count: data.length,
      totalCount,
      limit,
      truncated: totalCount > limit,
      exportedAt: new Date(),
      data,
    };
  }
}
