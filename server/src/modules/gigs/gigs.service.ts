import { GigModel, Gig, BidModel, ApplicationModel, EventCheckInModel } from '../../db/models';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '../../plugins/error.plugin';
import { GigStatus, BidStatus, ApplicationStatus, CheckInStatus } from '../../shared/enums';
import { s3Service } from '../../services/s3.service';

/**
 * Valid gig status transitions
 * DRAFT → LIVE → BOOKED → COMPLETED (via OTP check-in flow) or CLOSED → COMPLETED.
 * BOOKED → COMPLETED is the canonical happy-path completion driven by the OTP
 * end-event flow.
 */
const VALID_STATUS_TRANSITIONS: Record<GigStatus, GigStatus[]> = {
  [GigStatus.DRAFT]: [GigStatus.LIVE, GigStatus.CANCELLED],
  [GigStatus.LIVE]: [GigStatus.BOOKED, GigStatus.CLOSED, GigStatus.CANCELLED],
  [GigStatus.BOOKED]: [GigStatus.CLOSED, GigStatus.COMPLETED, GigStatus.CANCELLED],
  [GigStatus.CLOSED]: [GigStatus.COMPLETED, GigStatus.CANCELLED],
  [GigStatus.COMPLETED]: [], // Terminal state
  [GigStatus.CANCELLED]: [], // Terminal state
};

/**
 * Gigs Service
 */
export class GigsService {
  /**
   * Validate status transition
   */
  private validateStatusTransition(currentStatus: GigStatus, newStatus: GigStatus): void {
    const validTransitions = VALID_STATUS_TRANSITIONS[currentStatus] || [];
    if (!validTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition: ${currentStatus} → ${newStatus}. ` +
        `Valid transitions from ${currentStatus}: ${validTransitions.join(', ') || 'none (terminal state)'}`
      );
    }
  }

  /**
   * Validate gig DTO for business rules
   */
  private validateGigDto(dto: any): void {
    // Validate budget: min <= max
    if (dto.budget && dto.budget.min > dto.budget.max) {
      throw new BadRequestException('Budget min cannot be greater than max');
    }

    // Validate event date is in the future (only for new gigs or date changes).
    // Compare in UTC to avoid local-day boundary surprises across timezones.
    if (dto.eventTiming?.date) {
      const eventDate = new Date(dto.eventTiming.date);
      const now = new Date();
      // Allow any timestamp from "now minus 24h" forward to absorb timezone
      // offsets while still rejecting genuinely past dates.
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      if (eventDate < cutoff) {
        throw new BadRequestException('Event date must be in the future');
      }
    }

    // Validate startTime/endTime ordering. If end < start, the event is
    // overnight; require explicit opt-in.
    if (dto.eventTiming?.startTime && dto.eventTiming?.endTime) {
      const start = this.parseTime(dto.eventTiming.startTime);
      const end = this.parseTime(dto.eventTiming.endTime);
      if (end <= start && !dto.eventTiming.overnightAllowed) {
        throw new BadRequestException(
          'End time must be after start time. Set eventTiming.overnightAllowed=true for overnight events.'
        );
      }
    }

    // Validate coordinates if provided
    if (dto.venue?.coordinates) {
      const { lat, lng } = dto.venue.coordinates;
      if (lat < -90 || lat > 90) {
        throw new BadRequestException('Latitude must be between -90 and 90');
      }
      if (lng < -180 || lng > 180) {
        throw new BadRequestException('Longitude must be between -180 and 180');
      }
    }
  }

  /** Parse "HH:mm" into a numeric minute-of-day for comparisons. */
  private parseTime(value: string): number {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Create a new Gig
   */
  async createGig(userId: string, dto: any): Promise<any> {
    // Validate business rules
    this.validateGigDto(dto);

    // Calculate duration
    const start = new Date(`2000-01-01T${dto.eventTiming.startTime}`);
    const end = new Date(`2000-01-01T${dto.eventTiming.endTime}`);
    let durationMinutes = (end.getTime() - start.getTime()) / 60000;

    if (durationMinutes < 0) durationMinutes += 1440; // Handle overnight

    // Build venue with geoPoint if coordinates provided
    const venue = { ...dto.venue };
    if (dto.venue.coordinates?.lat && dto.venue.coordinates?.lng) {
      venue.geoPoint = {
        type: 'Point',
        coordinates: [dto.venue.coordinates.lng, dto.venue.coordinates.lat], // [lng, lat]
      };
    }

    const gigDoc = new GigModel({
      ...dto,
      venue,
      eventTiming: {
        ...dto.eventTiming,
        durationMinutes,
      },
      postedBy: userId,
      status: GigStatus.DRAFT, // Always start as DRAFT
    });
    const gig = await gigDoc.save();

    const populated = await GigModel.findById(gig._id)
      .populate('postedBy', 'name profilePicture')
      .exec();

    return this.transformGigResponse(populated);
  }

  /**
   * Get Gig by ID
   */
  async getGig(id: string, incrementView = false): Promise<any> {
    const gig = await GigModel.findById(id)
      .populate('postedBy', 'name profilePicture clientProfile')
      .lean()
      .exec();

    if (!gig) {
      throw new NotFoundException('Gig not found');
    }

    // Increment view count atomically if requested (prevents race condition)
    if (incrementView && gig.status === GigStatus.LIVE) {
      await GigModel.updateOne({ _id: id }, { $inc: { viewCount: 1 } });
      (gig as any).viewCount = ((gig as any).viewCount || 0) + 1; // Update local copy for response
    }

    return this.transformGigResponse(gig);
  }

  /**
   * Update Gig
   */
  async updateGig(id: string, userId: string, dto: any): Promise<any> {
    const gig = await GigModel.findById(id).exec();

    if (!gig) {
      throw new NotFoundException('Gig not found');
    }

    if (gig.postedBy.toString() !== userId) {
      throw new ForbiddenException('You are not authorized to update this gig');
    }

    // Validate the partial dto's business rules (budget bounds, future date,
    // coordinates, time ordering). Only fields present are checked.
    this.validateGigDto(dto);

    // Validate status transition if status is being changed
    if (dto.status && dto.status !== gig.status) {
      this.validateStatusTransition(gig.status, dto.status);
    }

    // Don't allow updating completed/cancelled gigs
    if (gig.status === GigStatus.COMPLETED || gig.status === GigStatus.CANCELLED) {
      throw new BadRequestException(`Cannot update a ${gig.status.toLowerCase()} gig`);
    }

    // Apply updates (excluding status for separate handling)
    const { status: newStatus, ...otherUpdates } = dto;
    Object.assign(gig, otherUpdates);

    // If venue.coordinates were changed, rebuild geoPoint for $geoNear queries.
    if (dto.venue?.coordinates?.lat !== undefined && dto.venue?.coordinates?.lng !== undefined) {
      gig.venue.geoPoint = {
        type: 'Point',
        coordinates: [dto.venue.coordinates.lng, dto.venue.coordinates.lat],
      };
      gig.markModified('venue');
    }

    // Apply status change if valid
    if (newStatus) {
      gig.status = newStatus;
    }

    // Recalculate duration if timing changed
    if (dto.eventTiming) {
      const start = new Date(`2000-01-01T${gig.eventTiming.startTime}`);
      const end = new Date(`2000-01-01T${gig.eventTiming.endTime}`);
      let durationMinutes = (end.getTime() - start.getTime()) / 60000;
      if (durationMinutes < 0) durationMinutes += 1440;
      gig.eventTiming.durationMinutes = durationMinutes;
    }

    await gig.save();

    const populated = await GigModel.findById(gig._id)
      .populate('postedBy', 'name profilePicture')
      .exec();

    return this.transformGigResponse(populated);
  }

  /**
   * Update gig status (internal use - called by applications service)
   */
  async updateGigStatus(gigId: string, newStatus: GigStatus): Promise<void> {
    const gig = await GigModel.findById(gigId).exec();
    if (!gig) {
      throw new NotFoundException('Gig not found');
    }

    this.validateStatusTransition(gig.status, newStatus);
    gig.status = newStatus;
    await gig.save();
  }

  /**
   * Publish a draft gig (DRAFT → LIVE)
   * Matches frontend: POST /gigs/:id/publish
   */
  async publishGig(id: string, userId: string): Promise<any> {
    const gig = await GigModel.findById(id).exec();

    if (!gig) {
      throw new NotFoundException('Gig not found');
    }

    if (gig.postedBy.toString() !== userId) {
      throw new ForbiddenException('You are not authorized to publish this gig');
    }

    if (gig.status !== GigStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot publish a ${gig.status.toLowerCase()} gig. Only draft gigs can be published.`
      );
    }

    this.validateStatusTransition(gig.status, GigStatus.LIVE);
    gig.status = GigStatus.LIVE;
    await gig.save();

    const populated = await GigModel.findById(gig._id)
      .populate('postedBy', 'name profilePicture')
      .exec();

    return this.transformGigResponse(populated);
  }

  /**
   * Cascade: when a gig leaves the active lifecycle (closed or cancelled),
   * terminate any in-flight bids, applications, and check-in record.
   * - PENDING bids/applications -> REJECTED (server-initiated rejection).
   * - ACCEPTED bid/application  -> CANCELLED (booking torn down).
   * - Non-terminal check-in     -> CANCELLED.
   */
  private async cascadeTerminate(gigId: any): Promise<void> {
    await BidModel.updateMany(
      { gigId, status: BidStatus.PENDING },
      { $set: { status: BidStatus.REJECTED } }
    );
    await BidModel.updateMany(
      { gigId, status: BidStatus.ACCEPTED },
      { $set: { status: BidStatus.CANCELLED } }
    );

    await ApplicationModel.updateMany(
      { gig: gigId, status: ApplicationStatus.PENDING },
      { $set: { status: ApplicationStatus.REJECTED } }
    );
    await ApplicationModel.updateMany(
      { gig: gigId, status: ApplicationStatus.ACCEPTED },
      { $set: { status: ApplicationStatus.CANCELLED } }
    );

    await EventCheckInModel.updateMany(
      {
        gig: gigId,
        status: {
          $nin: [
            CheckInStatus.EVENT_ENDED,
            CheckInStatus.CANCELLED,
            CheckInStatus.EXPIRED,
          ],
        },
      },
      { $set: { status: CheckInStatus.CANCELLED } }
    );
  }

  /**
   * Close a gig (LIVE/BOOKED → CLOSED)
   * Matches frontend: POST /gigs/:id/close
   * CLOSED is a post-event state, so reject if event date has not passed.
   * CASCADE: terminates pending and accepted bids, applications, check-in.
   */
  async closeGig(id: string, userId: string): Promise<any> {
    const gig = await GigModel.findById(id).exec();

    if (!gig) {
      throw new NotFoundException('Gig not found');
    }

    if (gig.postedBy.toString() !== userId) {
      throw new ForbiddenException('You are not authorized to close this gig');
    }

    if (gig.status !== GigStatus.LIVE && gig.status !== GigStatus.BOOKED) {
      throw new BadRequestException(
        `Cannot close a ${gig.status.toLowerCase()} gig. Only live or booked gigs can be closed.`
      );
    }

    // CLOSED represents "post-event, awaiting completion". Reject closures
    // attempted before the event date.
    if (gig.eventTiming?.date && new Date(gig.eventTiming.date) > new Date()) {
      throw new BadRequestException(
        'Cannot close a gig before its event date. Use cancel instead.'
      );
    }

    this.validateStatusTransition(gig.status, GigStatus.CLOSED);
    gig.status = GigStatus.CLOSED;
    await gig.save();

    await this.cascadeTerminate(gig._id);

    const populated = await GigModel.findById(gig._id)
      .populate('postedBy', 'name profilePicture')
      .exec();

    return this.transformGigResponse(populated);
  }

  /**
   * Cancel a gig (Any non-terminal → CANCELLED)
   * Matches frontend: POST /gigs/:id/cancel
   * CASCADE: terminates pending and accepted bids, applications, check-in.
   */
  async cancelGig(id: string, userId: string): Promise<any> {
    const gig = await GigModel.findById(id).exec();

    if (!gig) {
      throw new NotFoundException('Gig not found');
    }

    if (gig.postedBy.toString() !== userId) {
      throw new ForbiddenException('You are not authorized to cancel this gig');
    }

    if (gig.status === GigStatus.COMPLETED || gig.status === GigStatus.CANCELLED) {
      throw new BadRequestException(
        `Cannot cancel a ${gig.status.toLowerCase()} gig. It is already in a terminal state.`
      );
    }

    this.validateStatusTransition(gig.status, GigStatus.CANCELLED);
    gig.status = GigStatus.CANCELLED;
    await gig.save();

    await this.cascadeTerminate(gig._id);

    const populated = await GigModel.findById(gig._id)
      .populate('postedBy', 'name profilePicture')
      .exec();

    return this.transformGigResponse(populated);
  }

  /**
   * Complete a gig (CLOSED → COMPLETED)
   * Matches frontend: POST /gigs/:id/complete
   */
  async completeGig(id: string, userId: string): Promise<any> {
    const gig = await GigModel.findById(id).exec();

    if (!gig) {
      throw new NotFoundException('Gig not found');
    }

    if (gig.postedBy.toString() !== userId) {
      throw new ForbiddenException('You are not authorized to complete this gig');
    }

    if (gig.status !== GigStatus.CLOSED) {
      throw new BadRequestException(
        `Cannot complete a ${gig.status.toLowerCase()} gig. Only closed gigs can be marked as completed.`
      );
    }

    this.validateStatusTransition(gig.status, GigStatus.COMPLETED);
    gig.status = GigStatus.COMPLETED;
    await gig.save();

    const populated = await GigModel.findById(gig._id)
      .populate('postedBy', 'name profilePicture')
      .exec();

    return this.transformGigResponse(populated);
  }

  /**
   * Complete a gig from the OTP check-in flow (BOOKED → COMPLETED).
   * Atomically validates the gig is still BOOKED so we never resurrect a
   * cancelled or already-completed gig from the check-in flow.
   *
   * Throws ConflictException(409) if the gig is no longer in a state that
   * permits completion, so callers can surface a meaningful error.
   */
  async completeGigFromCheckIn(gigId: string): Promise<void> {
    // Only BOOKED gigs are valid candidates. The state-machine map allows
    // BOOKED -> COMPLETED so this is consistent with manual transitions.
    const updated = await GigModel.findOneAndUpdate(
      { _id: gigId, status: GigStatus.BOOKED },
      { $set: { status: GigStatus.COMPLETED } },
      { new: true }
    ).exec();

    if (!updated) {
      throw new ConflictException(
        'Gig is no longer in a state that permits completion'
      );
    }
  }

  /**
   * Delete Gig
   */
  async deleteGig(id: string, userId: string): Promise<void> {
    const gig = await GigModel.findById(id).exec();

    if (!gig) {
      throw new NotFoundException('Gig not found');
    }

    if (gig.postedBy.toString() !== userId) {
      throw new ForbiddenException('You are not authorized to delete this gig');
    }

    // Only allow deleting DRAFT or CANCELLED gigs
    if (gig.status !== GigStatus.DRAFT && gig.status !== GigStatus.CANCELLED) {
      throw new BadRequestException(
        `Cannot delete a ${gig.status.toLowerCase()} gig. Only draft or cancelled gigs can be deleted.`
      );
    }

    await gig.deleteOne();
  }

  /**
   * Search Gigs
   *
   * Visibility rules:
   * - Unauthenticated / cross-user discovery is forced to status=LIVE so we
   *   never leak DRAFT/CLOSED gigs (or admin-flagged ones) via ?postedBy=X.
   * - Only when the caller is the owner (callerId === postedBy) is an
   *   arbitrary status filter honored.
   * - Provided `status` values are whitelisted against GigStatus; bogus values
   *   are silently dropped.
   */
  async searchGigs(params: {
    query?: string;
    city?: string;
    category?: string;
    status?: string;
    minBudget?: number;
    maxBudget?: number;
    date?: string;
    dateFrom?: string;
    lat?: number;
    lng?: number;
    distance?: number;
    page: number;
    limit: number;
    postedBy?: string;
    callerId?: string;
    excludeGigs?: string[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const filter: any = {};

    const isOwnerView =
      !!params.postedBy && !!params.callerId && params.postedBy === params.callerId;
    const validStatuses = Object.values(GigStatus) as string[];
    const requestedStatus =
      params.status && validStatuses.includes(params.status)
        ? (params.status as GigStatus)
        : undefined;

    if (isOwnerView) {
      // Owner sees their full list (any status, including DRAFT).
      if (requestedStatus) filter.status = requestedStatus;
    } else {
      // Public/cross-user discovery is restricted to LIVE gigs only.
      filter.status = GigStatus.LIVE;
    }

    if (params.category) filter.category = params.category;
    if (params.postedBy) filter.postedBy = params.postedBy;

    // Exclude specific gigs (e.g., already applied to)
    if (params.excludeGigs && params.excludeGigs.length > 0) {
      filter._id = { $nin: params.excludeGigs };
    }

    // Text Search
    if (params.query) {
      filter.$text = { $search: params.query };
    }

    // Filters
    if (params.city) {
      filter['venue.city'] = { $regex: params.city, $options: 'i' };
    }

    // Budget filter - find gigs where the budget range overlaps with user's range
    // User wants gigs where: gig.min <= user.max AND gig.max >= user.min
    if (params.minBudget !== undefined || params.maxBudget !== undefined) {
      // If user specifies minBudget, gig's max must be at least that much
      if (params.minBudget !== undefined) {
        filter['budget.max'] = { $gte: params.minBudget };
      }
      // If user specifies maxBudget, gig's min must be at most that much
      if (params.maxBudget !== undefined) {
        filter['budget.min'] = { $lte: params.maxBudget };
      }
    }

    if (params.date) {
      const searchDate = new Date(params.date);
      const nextDay = new Date(searchDate);
      nextDay.setDate(searchDate.getDate() + 1);

      filter['eventTiming.date'] = {
        $gte: searchDate,
        $lt: nextDay,
      };
    } else if (params.dateFrom) {
      filter['eventTiming.date'] = { $gte: new Date(params.dateFrom) };
    } else if (!isOwnerView) {
      // Public discovery defaults to upcoming events only — past gigs should
      // not appear in search results.
      filter['eventTiming.date'] = { $gte: new Date() };
    }

    const skip = (params.page - 1) * params.limit;

    // Build sort options
    const sortOrder = params.sortOrder === 'asc' ? 1 : -1;
    const sortOptions: Record<string, any> = {
      date: { 'eventTiming.date': sortOrder },
      budget: { 'budget.max': sortOrder },
      city: { 'venue.city': sortOrder },
      createdAt: { createdAt: -1 },
    };
    const sort = params.query
      ? { score: { $meta: 'textScore' } }
      : sortOptions[params.sortBy || 'createdAt'] || { createdAt: -1 };

    const [gigs, total] = await Promise.all([
      GigModel.find(filter)
        .populate('postedBy', 'name profilePicture')
        .sort(sort as any)
        .skip(skip)
        .limit(params.limit)
        .lean()
        .exec(),
      GigModel.countDocuments(filter).exec(),
    ]);

    // Get actual bid counts for each gig (in case stored bidCount is out of sync)
    const gigIds = gigs.map(g => g._id);
    const bidCounts = await BidModel.aggregate([
      { $match: { gigId: { $in: gigIds }, status: { $in: [BidStatus.PENDING, BidStatus.ACCEPTED] } } },
      { $group: { _id: '$gigId', count: { $sum: 1 } } }
    ]);
    const bidCountMap = new Map(bidCounts.map(b => [b._id.toString(), b.count]));

    const totalPages = Math.ceil(total / params.limit);

    return {
      data: gigs.map(gig => this.transformGigListItem(gig, bidCountMap.get(gig._id.toString()) || 0)),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
        hasNextPage: params.page < totalPages,
        hasPreviousPage: params.page > 1,
      }
    };
  }

  /**
   * Get Available Cities with Live Gigs
   */
  async getAvailableCities(): Promise<string[]> {
    const cities = await GigModel.distinct('venue.city', {
      status: GigStatus.LIVE,
    }).exec();

    return cities.filter(Boolean); // Remove null/undefined values
  }

  /**
   * Search nearby gigs for artists using geospatial query
   * Artists can find events near their location
   */
  async searchNearbyGigs(params: {
    lat: number;
    lng: number;
    distance?: number; // meters, default 50km
    category?: string;
    minBudget?: number;
    maxBudget?: number;
    dateFrom?: string;
    dateTo?: string;
    page: number;
    limit: number;
  }): Promise<{
    data: any[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    // 50km default, hard-capped at 500km to prevent unbounded geo scans.
    const requestedDistance = params.distance || 50000;
    const maxDistance = Math.min(requestedDistance, 500_000);
    const skip = (params.page - 1) * params.limit;

    // Build the aggregation pipeline with $geoNear
    const matchStage: Record<string, unknown> = {
      status: GigStatus.LIVE,
    };

    if (params.category) matchStage.category = params.category;

    // Budget filter
    if (params.minBudget !== undefined) {
      matchStage['budget.max'] = { $gte: params.minBudget };
    }
    if (params.maxBudget !== undefined) {
      matchStage['budget.min'] = { $lte: params.maxBudget };
    }

    // Date range filter. Default to "now" so past events never surface.
    matchStage['eventTiming.date'] = {
      $gte: params.dateFrom ? new Date(params.dateFrom) : new Date(),
    };
    if (params.dateTo) {
      (matchStage['eventTiming.date'] as Record<string, Date>).$lte = new Date(params.dateTo);
    }

    // Use aggregation with $geoNear for distance calculation
    const pipeline: any[] = [
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [params.lng, params.lat],
          },
          distanceField: 'distance', // meters
          maxDistance: maxDistance,
          spherical: true,
          query: matchStage,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'postedBy',
          foreignField: '_id',
          as: 'postedByUser',
        },
      },
      {
        $unwind: {
          path: '$postedByUser',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: params.limit },
            {
              $project: {
                id: { $toString: '$_id' },
                title: 1,
                category: 1,
                budget: 1,
                city: '$venue.city',
                venueName: '$venue.name',
                eventDate: '$eventTiming.date',
                startTime: '$eventTiming.startTime',
                durationMinutes: '$eventTiming.durationMinutes',
                status: 1,
                coverImage: { $arrayElemAt: ['$images', 0] },
                applicationCount: 1,
                createdAt: 1,
                distance: 1, // Distance in meters
                distanceKm: { $divide: ['$distance', 1000] }, // Convert to km
                postedBy: {
                  id: { $toString: '$postedByUser._id' },
                  name: '$postedByUser.name',
                  profilePicture: '$postedByUser.profilePicture',
                },
              },
            },
          ],
          count: [{ $count: 'total' }],
        },
      },
    ];

    const [result] = await GigModel.aggregate(pipeline).exec();

    const total = result.count[0]?.total || 0;
    const totalPages = Math.ceil(total / params.limit);

    return {
      data: result.data.map((gig: any) => ({
        ...gig,
        distance: Math.round(gig.distance), // meters
        distanceKm: Math.round(gig.distanceKm * 10) / 10, // round to 1 decimal
      })),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
        hasNextPage: params.page < totalPages,
        hasPreviousPage: params.page > 1,
      },
    };
  }

  /**
   * Upload gig image using Bun's optimized file handling
   */
  async uploadGigImage(gigId: string, userId: string, file: File): Promise<string> {
    const gig = await GigModel.findById(gigId).exec();
    if (!gig) throw new NotFoundException('Gig not found');
    if (gig.postedBy.toString() !== userId) throw new ForbiddenException('Not authorized');

    // Allow image uploads while the gig is still in an editable phase
    // (DRAFT before publishing, LIVE so clients can refresh their listing).
    if (gig.status !== GigStatus.DRAFT && gig.status !== GigStatus.LIVE) {
      throw new BadRequestException('Can only upload images to draft or live gigs');
    }

    // Bun's native file operations are significantly faster
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const key = `gigs/${gigId}/${Date.now()}_${file.name}`;

    try {
      const url = await s3Service.uploadFile(buffer, key, file.type);
      gig.images.push(url);
      await gig.save();
      return url;
    } catch (error) {
      throw new BadRequestException('Failed to upload image');
    }
  }

  /**
   * Transform Gig document to full response format (matches NestJS GigResponseDto)
   */
  private transformGigResponse(gig: any): any {
    const postedByUser = gig.postedBy || {};

    return {
      id: gig._id.toString(),
      title: gig.title,
      description: gig.description,
      category: gig.category,
      budget: {
        min: gig.budget.min,
        max: gig.budget.max,
        currency: gig.budget.currency,
      },
      venue: {
        name: gig.venue.name,
        address: gig.venue.address,
        city: gig.venue.city,
        state: gig.venue.state,
        pincode: gig.venue.pincode,
        coordinates: gig.venue.coordinates,
      },
      eventTiming: {
        date: gig.eventTiming.date,
        startTime: gig.eventTiming.startTime,
        endTime: gig.eventTiming.endTime,
        durationMinutes: gig.eventTiming.durationMinutes,
      },
      images: gig.images,
      postedBy: {
        id: postedByUser._id?.toString() || gig.postedBy?.toString() || '',
        name: postedByUser.name,
        profilePicture: postedByUser.profilePicture,
      },
      status: gig.status,
      requirements: gig.requirements,
      equipmentProvided: gig.equipmentProvided,
      preferredGenres: gig.preferredGenres,
      viewCount: gig.viewCount,
      applicationCount: gig.applicationCount,
      bidsCount: gig.bidCount || 0,
      createdAt: gig.createdAt,
      updatedAt: gig.updatedAt,
    };
  }

  /**
   * Transform Gig document to list item format (matches NestJS GigListItemDto)
   * @param actualBidCount - Optional real-time bid count from aggregation (overrides stored bidCount)
   */
  private transformGigListItem(gig: any, actualBidCount?: number): any {
    return {
      id: gig._id.toString(),
      title: gig.title,
      description: gig.description,
      category: gig.category,
      budget: {
        min: gig.budget.min,
        max: gig.budget.max,
        currency: gig.budget.currency,
      },
      city: gig.venue.city,
      venueName: gig.venue.name,
      eventDate: gig.eventTiming.date,
      startTime: gig.eventTiming.startTime,
      durationMinutes: gig.eventTiming.durationMinutes,
      status: gig.status,
      coverImage: gig.images?.length > 0 ? gig.images[0] : undefined,
      applicationCount: gig.applicationCount,
      bidsCount: actualBidCount ?? gig.bidCount ?? 0,
      createdAt: gig.createdAt,
    };
  }
}
