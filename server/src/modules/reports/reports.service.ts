import {
  ReportModel,
  UserModel,
  Report,
  GigModel,
  ReviewModel,
  BidModel,
  ApplicationModel,
} from '../../db/models';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '../../plugins/error.plugin';
import { ReportStatus, ReportCategory, ReportType, UserStatus, UserRole } from '../../shared/enums';
import { validateObjectId } from '../../shared/utils/validation.utils';
import type {
  CreateReportDto,
  UpdateReportDto,
  AdminUpdateReportDto,
  ResolveReportDto,
  SearchReportsDto,
} from './reports.schemas';

/**
 * Report Response DTO
 */
export interface ReportResponse {
  id: string;
  reporter: {
    id: string;
    name?: string;
    profilePicture?: string;
  };
  reported: {
    entityType: string;
    entityId: string;
  };
  category: ReportCategory;
  type: ReportType;
  description: string;
  evidence: string[];
  status: ReportStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assignedTo?: {
    id: string;
    name?: string;
  };
  resolution?: {
    action: string;
    notes: string;
    resolvedBy: string;
    resolvedAt: Date;
  };
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Report Statistics
 */
export interface ReportStats {
  total: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  averageResolutionTime: number; // hours
}

/**
 * Reports Service
 */
export class ReportsService {
  /**
   * Create a report.
   *
   * SECURITY (H5):
   * - Resolves the owner of GIG/REVIEW/BID/APPLICATION targets and rejects
   *   self-reports (covers the "report your own gig to flush a competing
   *   bid" loophole that was previously only blocked for entityType=USER).
   * - Requires the entity to actually exist (404 otherwise).
   */
  async createReport(userId: string, dto: CreateReportDto): Promise<ReportResponse> {
    // Check for duplicate report
    const existingReport = await ReportModel.findOne({
      reporter: userId,
      'reported.entityType': dto.reported.entityType,
      'reported.entityId': dto.reported.entityId,
    }).exec();

    if (existingReport) {
      throw new BadRequestException('You have already reported this item');
    }

    // Resolve and validate the entity owner. Throws on self-target / missing.
    await this.assertEntityExistsAndNotOwnedBy(
      dto.reported.entityType,
      dto.reported.entityId,
      userId
    );

    // Create the report (priority is auto-calculated in pre-save hook)
    const report = new ReportModel({
      reporter: userId,
      reported: dto.reported,
      category: dto.category,
      type: dto.type,
      description: dto.description,
      evidence: dto.evidence || [],
      status: ReportStatus.PENDING,
    });

    await report.save();
    await report.populate('reporter', 'name profilePicture');

    return this.transformReportResponse(report);
  }

  /**
   * Resolve the owner of the target entity and reject self-reports.
   *
   * Owner mapping:
   * - USER          → entityId is the user
   * - GIG           → gig.postedBy
   * - REVIEW        → review.reviewer
   * - BID           → bid.artistId
   * - APPLICATION   → application.applicant
   */
  private async assertEntityExistsAndNotOwnedBy(
    entityType: 'USER' | 'GIG' | 'REVIEW' | 'BID' | 'APPLICATION',
    entityId: string,
    reporterUserId: string
  ): Promise<void> {
    validateObjectId(entityId, 'reported.entityId');

    let ownerId: string | undefined;

    switch (entityType) {
      case 'USER': {
        const target = await UserModel.findById(entityId).select('_id').lean().exec();
        if (!target) throw new NotFoundException('Reported user not found');
        ownerId = target._id.toString();
        break;
      }
      case 'GIG': {
        const target = await GigModel.findById(entityId).select('postedBy').lean().exec();
        if (!target) throw new NotFoundException('Reported gig not found');
        ownerId = target.postedBy?.toString();
        break;
      }
      case 'REVIEW': {
        const target = await ReviewModel.findById(entityId).select('reviewer').lean().exec();
        if (!target) throw new NotFoundException('Reported review not found');
        ownerId = target.reviewer?.toString();
        break;
      }
      case 'BID': {
        const target = await BidModel.findById(entityId).select('artistId').lean().exec();
        if (!target) throw new NotFoundException('Reported bid not found');
        ownerId = target.artistId?.toString();
        break;
      }
      case 'APPLICATION': {
        const target = await ApplicationModel.findById(entityId)
          .select('applicant')
          .lean()
          .exec();
        if (!target) throw new NotFoundException('Reported application not found');
        ownerId = target.applicant?.toString();
        break;
      }
    }

    if (ownerId && ownerId === reporterUserId) {
      throw new BadRequestException('You cannot report your own content');
    }
  }

  /**
   * Get report by ID
   */
  async getReport(reportId: string, userId: string, isAdmin: boolean): Promise<ReportResponse> {
    const report = await ReportModel.findById(reportId)
      .populate('reporter', 'name profilePicture')
      .populate('assignedTo', 'name')
      .exec();

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    // Only admin or reporter can view
    if (!isAdmin && report.reporter._id.toString() !== userId) {
      throw new ForbiddenException('You can only view your own reports');
    }

    return this.transformReportResponse(report);
  }

  /**
   * Get my reports
   */
  async getMyReports(
    userId: string,
    params: { status?: string; page?: number; limit?: number }
  ): Promise<{ data: ReportResponse[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { reporter: userId };
    if (params.status) filter.status = params.status;

    const [reports, total] = await Promise.all([
      ReportModel.find(filter)
        .populate('reporter', 'name profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      ReportModel.countDocuments(filter).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: reports.map((r) => this.transformReportResponse(r)),
      meta: { total, page, limit, totalPages },
    };
  }

  /**
   * Update own report (add more info)
   */
  async updateReport(reportId: string, userId: string, dto: UpdateReportDto): Promise<ReportResponse> {
    const report = await ReportModel.findById(reportId).exec();

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    if (report.reporter.toString() !== userId) {
      throw new ForbiddenException('You can only update your own reports');
    }

    // Can only update pending or needs_info reports
    if (report.status !== ReportStatus.PENDING && report.status !== ReportStatus.NEEDS_INFO) {
      throw new BadRequestException('Cannot update a report that is already being processed');
    }

    if (dto.description) report.description = dto.description;
    if (dto.evidence && dto.evidence.length > 0) {
      const existingEvidence = report.evidence || [];
      report.evidence = [...new Set([...existingEvidence, ...dto.evidence])].slice(0, 5);
    }

    await report.save();
    await report.populate('reporter', 'name profilePicture');

    return this.transformReportResponse(report);
  }

  /**
   * Admin: Search reports
   */
  async searchReports(
    params: SearchReportsDto
  ): Promise<{ data: ReportResponse[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (params.category) filter.category = params.category;
    if (params.type) filter.type = params.type;
    if (params.status) filter.status = params.status;
    if (params.priority) filter.priority = params.priority;
    if (params.assignedTo) filter.assignedTo = params.assignedTo;
    if (params.reporter) filter.reporter = params.reporter;
    if (params.entityType) filter['reported.entityType'] = params.entityType;
    if (params.entityId) filter['reported.entityId'] = params.entityId;

    const sortField = params.sortBy || 'createdAt';
    const sortOrder = params.sortOrder === 'asc' ? 1 : -1;

    const [reports, total] = await Promise.all([
      ReportModel.find(filter)
        .populate('reporter', 'name profilePicture')
        .populate('assignedTo', 'name')
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .exec(),
      ReportModel.countDocuments(filter).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: reports.map((r) => this.transformReportResponse(r)),
      meta: { total, page, limit, totalPages },
    };
  }

  /**
   * Admin: Update report.
   *
   * SECURITY (H6):
   * - Resolved reports cannot be mutated (re-open via separate workflow).
   * - `assignedTo` must be a 24-hex ObjectId pointing at a real ADMIN user.
   */
  async adminUpdateReport(
    reportId: string,
    _adminId: string,
    dto: AdminUpdateReportDto
  ): Promise<ReportResponse> {
    const report = await ReportModel.findById(reportId).exec();

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    if (report.status === ReportStatus.RESOLVED) {
      throw new BadRequestException('Resolved reports cannot be modified');
    }

    if (dto.assignedTo) {
      validateObjectId(dto.assignedTo, 'assignedTo');
      const assignee = await UserModel.findById(dto.assignedTo).select('role').lean().exec();
      if (!assignee || assignee.role !== UserRole.ADMIN) {
        throw new BadRequestException('assignedTo must reference an admin user');
      }
    }

    if (dto.status) report.status = dto.status;
    if (dto.priority) report.priority = dto.priority;
    if (dto.assignedTo) report.assignedTo = dto.assignedTo as any;
    if (dto.adminNotes) report.adminNotes = dto.adminNotes;

    await report.save();
    await report.populate('reporter', 'name profilePicture');
    await report.populate('assignedTo', 'name');

    return this.transformReportResponse(report);
  }

  /**
   * Admin: Resolve report
   */
  async resolveReport(
    reportId: string,
    adminId: string,
    dto: ResolveReportDto
  ): Promise<ReportResponse> {
    const report = await ReportModel.findById(reportId).exec();

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    // Set resolution
    report.resolution = {
      action: dto.action as any,
      notes: dto.notes,
      resolvedBy: adminId as any,
      resolvedAt: new Date(),
    };
    report.status = ReportStatus.RESOLVED;

    // Apply action to reported entity if needed
    if (dto.action === 'USER_SUSPENDED' || dto.action === 'USER_BANNED') {
      if (report.reported.entityType === 'USER') {
        const userStatus = dto.action === 'USER_BANNED' ? UserStatus.BANNED : UserStatus.SUSPENDED;
        await UserModel.findByIdAndUpdate(report.reported.entityId, {
          status: userStatus,
          statusReason: `Report #${reportId}: ${dto.notes}`,
        }).exec();
      }
    }

    await report.save();
    await report.populate('reporter', 'name profilePicture');
    await report.populate('assignedTo', 'name');

    return this.transformReportResponse(report);
  }

  /**
   * Admin: Get report statistics
   */
  async getReportStats(): Promise<ReportStats> {
    const [
      total,
      byStatus,
      byCategory,
      byPriority,
      resolvedReports,
    ] = await Promise.all([
      ReportModel.countDocuments().exec(),
      ReportModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).exec(),
      ReportModel.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]).exec(),
      ReportModel.aggregate([
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]).exec(),
      ReportModel.find({
        status: ReportStatus.RESOLVED,
        'resolution.resolvedAt': { $exists: true },
      })
        .select('createdAt resolution.resolvedAt')
        .exec(),
    ]);

    // Calculate average resolution time
    let avgResolutionTime = 0;
    if (resolvedReports.length > 0) {
      const totalTime = resolvedReports.reduce((sum, r) => {
        const created = new Date(r.createdAt).getTime();
        const resolved = new Date(r.resolution!.resolvedAt).getTime();
        return sum + (resolved - created);
      }, 0);
      avgResolutionTime = Math.round(totalTime / resolvedReports.length / (1000 * 60 * 60)); // hours
    }

    const statusMap: Record<string, number> = {};
    byStatus.forEach((s: { _id: string; count: number }) => {
      statusMap[s._id] = s.count;
    });

    const categoryMap: Record<string, number> = {};
    byCategory.forEach((c: { _id: string; count: number }) => {
      categoryMap[c._id] = c.count;
    });

    const priorityMap: Record<string, number> = {};
    byPriority.forEach((p: { _id: string; count: number }) => {
      priorityMap[p._id] = p.count;
    });

    return {
      total,
      byStatus: statusMap,
      byCategory: categoryMap,
      byPriority: priorityMap,
      averageResolutionTime: avgResolutionTime,
    };
  }

  /**
   * Get reports for an entity (Admin)
   */
  async getEntityReports(
    entityType: 'USER' | 'GIG' | 'REVIEW' | 'BID' | 'APPLICATION',
    entityId: string
  ): Promise<ReportResponse[]> {
    const reports = await ReportModel.find({
      'reported.entityType': entityType,
      'reported.entityId': entityId,
    })
      .populate('reporter', 'name profilePicture')
      .sort({ createdAt: -1 })
      .exec();

    return reports.map((r) => this.transformReportResponse(r));
  }

  /**
   * Delete report (Admin only)
   */
  async deleteReport(reportId: string): Promise<void> {
    const report = await ReportModel.findById(reportId).exec();

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    await report.deleteOne();
  }

  /**
   * Transform Report document to response DTO
   */
  private transformReportResponse(report: Report): ReportResponse {
    const reporter = report.reporter as unknown as {
      _id: { toString(): string };
      name?: string;
      profilePicture?: string;
    };
    const assignedTo = report.assignedTo as unknown as {
      _id: { toString(): string };
      name?: string;
    } | undefined;

    return {
      id: report._id.toString(),
      reporter: {
        id: reporter._id?.toString() || report.reporter.toString(),
        name: reporter.name,
        profilePicture: reporter.profilePicture,
      },
      reported: {
        entityType: report.reported.entityType,
        entityId: report.reported.entityId.toString(),
      },
      category: report.category,
      type: report.type,
      description: report.description,
      evidence: report.evidence || [],
      status: report.status,
      priority: report.priority,
      assignedTo: assignedTo?._id
        ? {
            id: assignedTo._id.toString(),
            name: assignedTo.name,
          }
        : undefined,
      resolution: report.resolution
        ? {
            action: report.resolution.action,
            notes: report.resolution.notes,
            resolvedBy: report.resolution.resolvedBy.toString(),
            resolvedAt: report.resolution.resolvedAt,
          }
        : undefined,
      adminNotes: report.adminNotes,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }
}
