import { ApplicationModel, GigModel, BidModel, Application } from '../../db/models';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '../../plugins/error.plugin';
import { ApplicationStatus, BidStatus, GigStatus } from '../../shared/enums';

/**
 * Valid application status transitions.
 *
 * The CANCELLED terminal is reached when a gig is cancelled or closed
 * (gig-level cascade in GigsService.cascadeTerminate). It is intentionally
 * NOT reachable from the user-facing updateStatus endpoint.
 */
const VALID_STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  [ApplicationStatus.PENDING]: [
    ApplicationStatus.ACCEPTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.CANCELLED,
  ],
  [ApplicationStatus.ACCEPTED]: [
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.CANCELLED,
  ],
  [ApplicationStatus.REJECTED]: [], // Terminal state
  [ApplicationStatus.WITHDRAWN]: [], // Terminal state
  [ApplicationStatus.CANCELLED]: [], // Terminal state (gig cancelled/closed)
};

/**
 * Applications Service
 */
export class ApplicationsService {
  /**
   * Validate status transition
   */
  private validateStatusTransition(currentStatus: ApplicationStatus, newStatus: ApplicationStatus): void {
    const validTransitions = VALID_STATUS_TRANSITIONS[currentStatus] || [];
    if (!validTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition: ${currentStatus} → ${newStatus}. ` +
        `Valid transitions from ${currentStatus}: ${validTransitions.join(', ') || 'none (terminal state)'}`
      );
    }
  }

  /**
   * Create Application.
   *
   * Mirrors placeBid's validations: gig must be LIVE, must not be the
   * applicant's own gig, and the event must still be in the future.
   */
  async createApplication(userId: string, dto: any): Promise<any> {
    const gig = await GigModel.findById(dto.gigId).exec();

    if (!gig) {
      throw new NotFoundException('Gig not found');
    }

    if (gig.status !== GigStatus.LIVE) {
      throw new BadRequestException('Gig is not accepting applications');
    }

    if (gig.postedBy.toString() === userId) {
      throw new ForbiddenException('Cannot apply to your own gig');
    }

    if (gig.eventTiming?.date && new Date(gig.eventTiming.date) < new Date()) {
      throw new BadRequestException(
        'Cannot apply to a gig whose event date has passed'
      );
    }

    const existingApp = await ApplicationModel.findOne({
      gig: dto.gigId,
      applicant: userId,
    }).exec();

    if (existingApp) {
      throw new BadRequestException('You have already applied to this gig');
    }

    const appDoc = new ApplicationModel({
      gig: dto.gigId,
      applicant: userId,
      bidAmount: dto.bidAmount,
      proposal: dto.proposal,
      status: ApplicationStatus.PENDING,
    });
    const application = await appDoc.save();

    // Increment application count atomically
    await GigModel.updateOne({ _id: dto.gigId }, { $inc: { applicationCount: 1 } });

    return this.transformApplicationResponse(application);
  }

  /**
   * Get Gig Applications (Client only)
   */
  async getGigApplications(gigId: string, userId: string): Promise<any[]> {
    const gig = await GigModel.findById(gigId).exec();
    if (!gig) throw new NotFoundException('Gig not found');

    if (gig.postedBy.toString() !== userId) {
      throw new ForbiddenException('Not authorized to view applications');
    }

    const applications = await ApplicationModel.find({ gig: gigId })
      .populate('applicant', 'name profilePicture artistProfile')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return applications.map(app => this.transformApplicationResponse(app));
  }

  /**
   * Get My Applications (Artist only) with optional status filter and pagination.
   */
  async getMyApplications(
    userId: string,
    page = 1,
    limit = 20,
    status?: ApplicationStatus
  ): Promise<{
    data: any[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { applicant: userId };
    if (status) filter.status = status;

    const [applications, total] = await Promise.all([
      ApplicationModel.find(filter)
        .populate('gig', 'title budget eventTiming venue status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      ApplicationModel.countDocuments(filter).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: applications.map(app => this.transformApplicationResponse(app)),
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Update Application Status
   * - Client can ACCEPT or REJECT pending applications.
   * - Artist can WITHDRAW their own pending applications.
   * - Acceptance is atomic (mirrors BidsService.acceptBid):
   *     1. Atomic PENDING -> ACCEPTED on the application.
   *     2. Atomic gig claim (LIVE -> BOOKED) only if no other accepted entry.
   *     3. Cross-reject pending bids and applications. Rollback on race loss.
   */
  async updateStatus(appId: string, userId: string, status: ApplicationStatus): Promise<any> {
    const app = await ApplicationModel.findById(appId).populate('gig').exec();
    if (!app) throw new NotFoundException('Application not found');

    const gig = app.gig as any;
    const isGigOwner = gig.postedBy.toString() === userId;
    const isApplicant = app.applicant.toString() === userId;

    // Validate who can make this status change
    if (status === ApplicationStatus.WITHDRAWN) {
      if (!isApplicant) {
        throw new ForbiddenException('Only the applicant can withdraw their application');
      }
    } else if (status === ApplicationStatus.ACCEPTED || status === ApplicationStatus.REJECTED) {
      if (!isGigOwner) {
        throw new ForbiddenException('Only the gig owner can accept or reject applications');
      }
    } else {
      throw new BadRequestException(`Invalid status: ${status}`);
    }

    // Validate the status transition (state-machine guard).
    this.validateStatusTransition(app.status, status);

    if (status === ApplicationStatus.ACCEPTED) {
      return this.acceptApplication(appId, gig, app);
    }

    if (status === ApplicationStatus.REJECTED) {
      const updated = await ApplicationModel.findOneAndUpdate(
        { _id: appId, status: ApplicationStatus.PENDING },
        { $set: { status: ApplicationStatus.REJECTED } },
        { new: true }
      ).exec();
      if (!updated) {
        throw new ConflictException('Application is no longer pending');
      }
      // Decrement counter (rejection removes from the active pool).
      await GigModel.updateOne(
        { _id: gig._id, applicationCount: { $gt: 0 } },
        { $inc: { applicationCount: -1 } }
      );
      return this.transformApplicationResponse(updated);
    }

    if (status === ApplicationStatus.WITHDRAWN) {
      const updated = await ApplicationModel.findOneAndUpdate(
        { _id: appId, status: { $in: [ApplicationStatus.PENDING, ApplicationStatus.ACCEPTED] } },
        { $set: { status: ApplicationStatus.WITHDRAWN } },
        { new: true }
      ).exec();
      if (!updated) {
        throw new ConflictException('Application is not in a withdrawable state');
      }
      // Decrement counter (withdraw also removes from the active pool).
      await GigModel.updateOne(
        { _id: gig._id, applicationCount: { $gt: 0 } },
        { $inc: { applicationCount: -1 } }
      );
      return this.transformApplicationResponse(updated);
    }

    throw new BadRequestException(`Unsupported status transition to ${status}`);
  }

  /**
   * Atomic application accept path. The gig must still be LIVE and free of
   * any other accepted bid/applicant for the claim to succeed; we roll the
   * application back if we lose the race.
   */
  private async acceptApplication(appId: string, gig: any, app: any): Promise<any> {
    if (gig.status !== GigStatus.LIVE) {
      throw new BadRequestException('Cannot accept applications for non-live gigs');
    }

    // 1. Atomic application PENDING -> ACCEPTED.
    const accepted = await ApplicationModel.findOneAndUpdate(
      { _id: appId, status: ApplicationStatus.PENDING },
      { $set: { status: ApplicationStatus.ACCEPTED } },
      { new: true }
    ).exec();
    if (!accepted) {
      throw new ConflictException('Application is no longer pending');
    }

    // 2. Atomic gig claim — only if free of other accepted entries.
    const lockedGig = await GigModel.findOneAndUpdate(
      {
        _id: gig._id,
        status: GigStatus.LIVE,
        acceptedBid: { $exists: false },
        acceptedApplicant: { $exists: false },
      },
      {
        $set: {
          status: GigStatus.BOOKED,
          acceptedApplicant: app.applicant,
        },
      },
      { new: true }
    ).exec();

    if (!lockedGig) {
      // Roll back — another bid/application beat us to the claim.
      await ApplicationModel.updateOne(
        { _id: accepted._id, status: ApplicationStatus.ACCEPTED },
        { $set: { status: ApplicationStatus.PENDING } }
      );
      throw new ConflictException(
        'Gig has already been awarded to another bid or applicant'
      );
    }

    // 3. Cross-reject pending siblings (both applications and bids).
    await ApplicationModel.updateMany(
      {
        gig: gig._id,
        _id: { $ne: accepted._id },
        status: ApplicationStatus.PENDING,
      },
      { $set: { status: ApplicationStatus.REJECTED } }
    );
    await BidModel.updateMany(
      {
        gigId: gig._id,
        status: BidStatus.PENDING,
      },
      { $set: { status: BidStatus.REJECTED } }
    );

    return this.transformApplicationResponse(accepted);
  }

  /**
   * Transform Application document to response format (matches NestJS ApplicationResponseDto)
   */
  private transformApplicationResponse(app: any): any {
    const applicant = app.applicant || {};
    const gig = app.gig || {};

    return {
      id: app._id.toString(),
      gigId: gig._id?.toString() || app.gig?.toString() || '',
      applicantId: applicant._id?.toString() || app.applicant?.toString() || '',
      applicant: applicant._id ? {
        id: applicant._id.toString(),
        name: applicant.name,
        profilePicture: applicant.profilePicture,
        artistProfile: applicant.artistProfile,
      } : undefined,
      gig: gig._id ? {
        id: gig._id.toString(),
        title: gig.title,
        status: gig.status,
        budget: gig.budget,
        eventTiming: gig.eventTiming,
        venue: gig.venue,
      } : undefined,
      bidAmount: app.bidAmount,
      proposal: app.proposal,
      status: app.status,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }
}
