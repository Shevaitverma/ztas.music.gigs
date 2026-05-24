import { BidModel, GigModel, Bid, ApplicationModel } from '../../db/models';
import { NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '../../plugins/error.plugin';
import { BidStatus, GigStatus, ApplicationStatus } from '../../shared/enums';
import type { PlaceBidDto } from './bids.schemas';

/**
 * Bids Service - Reverse Auction System
 *
 * Reverse-auction invariants enforced here:
 * - amount must be positive (>=1) and within gig.budget bounds.
 * - First bid must satisfy gig.budget.min <= amount <= gig.budget.max.
 * - Subsequent bids must lower the current lowest pending bid.
 * - Updates may only LOWER an existing pending bid (artists may not raise).
 * - Withdraw is allowed any time the bid is still PENDING.
 * - Accept is atomic: a bid moves PENDING -> ACCEPTED in a single
 *   conditional update, the gig is then locked into BOOKED only if no other
 *   bid/application has been accepted yet, and sibling pending entries (both
 *   bids and applications) are auto-rejected.
 */
export class BidsService {
  /**
   * Get the current lowest bid for a gig
   */
  private async getLowestBid(gigId: string): Promise<any | null> {
    const lowestBid = await BidModel.findOne({
      gigId,
      status: BidStatus.PENDING,
    })
      .sort({ amount: 1 })
      .exec();
    return lowestBid;
  }

  /**
   * Check if an artist has been outbid (someone bid lower than them)
   */
  private async isArtistOutbid(gigId: string, artistBidAmount: number): Promise<boolean> {
    const lowerBid = await BidModel.findOne({
      gigId,
      status: BidStatus.PENDING,
      amount: { $lt: artistBidAmount },
    }).exec();
    return !!lowerBid;
  }

  /**
   * Place a Bid (Reverse Auction)
   * - Must be a positive amount (>0).
   * - Must always be <= gig.budget.max (regardless of whether other bids exist).
   * - First bid must additionally be >= gig.budget.min.
   * - Subsequent bids must be strictly lower than the current lowest pending.
   * - Event must still be in the future.
   */
  async placeBid(userId: string, dto: PlaceBidDto): Promise<any> {
    const gig = await GigModel.findById(dto.gigId).exec();

    if (!gig) {
      throw new NotFoundException('Gig not found');
    }

    if (gig.status !== GigStatus.LIVE) {
      throw new BadRequestException('Gig is not accepting bids');
    }

    if (gig.postedBy.toString() === userId) {
      throw new ForbiddenException('Cannot bid on your own gig');
    }

    // Reject bids on past events (event date must be in the future).
    if (gig.eventTiming?.date && new Date(gig.eventTiming.date) < new Date()) {
      throw new BadRequestException('Cannot bid on a gig whose event date has passed');
    }

    // Universal amount sanity: positive, and within gig.budget.max ceiling.
    if (typeof dto.amount !== 'number' || dto.amount <= 0) {
      throw new BadRequestException('Bid amount must be a positive number');
    }
    if (dto.amount > gig.budget.max) {
      throw new BadRequestException(
        `Bid must not exceed the maximum budget (max ₹${gig.budget.max})`
      );
    }

    // Check if artist already has an active bid
    const existingBid = await BidModel.findOne({
      gigId: dto.gigId,
      artistId: userId,
      status: BidStatus.PENDING,
    }).exec();

    if (existingBid) {
      throw new BadRequestException(
        'You already have an active bid. Update it to lower your offer.'
      );
    }

    // Get current lowest bid
    const lowestBid = await this.getLowestBid(dto.gigId);

    if (lowestBid) {
      // Must bid lower than current lowest
      if (dto.amount >= lowestBid.amount) {
        throw new BadRequestException(
          `Your bid must be lower than the current lowest bid of ₹${lowestBid.amount}`
        );
      }
    } else {
      // First bid additionally must respect the floor (gig.budget.min).
      if (dto.amount < gig.budget.min) {
        throw new BadRequestException(
          `Bid must be at least the minimum budget (min ₹${gig.budget.min})`
        );
      }
    }

    // Create+populate inline (saves an extra round-trip).
    const bidDoc = await BidModel.create({
      ...dto,
      artistId: userId,
      status: BidStatus.PENDING,
    });

    // Increment bid count on the gig
    await GigModel.updateOne({ _id: dto.gigId }, { $inc: { bidCount: 1 } });

    const populated = await BidModel.populate(bidDoc, {
      path: 'artistId',
      select: 'name profilePicture artistProfile',
    });

    return this.transformBidResponse(populated);
  }

  /**
   * Update Bid Amount (Reverse Auction)
   * - Allowed any time the bid is PENDING.
   * - The new amount must be strictly lower than the artist's previous amount
   *   (artists cannot raise their bid).
   * - The new amount must remain a positive number within budget bounds and,
   *   if siblings exist, lower than the current lowest.
   */
  async updateBidAmount(bidId: string, userId: string, newAmount: number): Promise<any> {
    const bid = await BidModel.findById(bidId).exec();
    if (!bid) throw new NotFoundException('Bid not found');

    if (bid.artistId.toString() !== userId) {
      throw new ForbiddenException('Not authorized to update this bid');
    }

    if (bid.status !== BidStatus.PENDING) {
      throw new BadRequestException('Can only update pending bids');
    }

    if (typeof newAmount !== 'number' || newAmount <= 0) {
      throw new BadRequestException('Bid amount must be a positive number');
    }

    // Artists may only LOWER their existing offer.
    if (newAmount >= bid.amount) {
      throw new BadRequestException(
        `Your new bid must be lower than your current bid of ₹${bid.amount}`
      );
    }

    // Re-check budget ceiling (cheap and protects against misuse).
    const gig = await GigModel.findById(bid.gigId).exec();
    if (gig && newAmount > gig.budget.max) {
      throw new BadRequestException(
        `Bid must not exceed the maximum budget (max ₹${gig.budget.max})`
      );
    }

    // Must beat the current lowest pending bid from any artist (excluding self).
    const lowestOther = await BidModel.findOne({
      gigId: bid.gigId,
      status: BidStatus.PENDING,
      _id: { $ne: bid._id },
    })
      .sort({ amount: 1 })
      .exec();
    if (lowestOther && newAmount >= lowestOther.amount) {
      throw new BadRequestException(
        `Your new bid must be lower than the current lowest bid of ₹${lowestOther.amount}`
      );
    }

    bid.amount = newAmount;
    await bid.save();

    // Populate for response
    const updatedBid = await BidModel.findById(bidId)
      .populate('artistId', 'name profilePicture artistProfile')
      .exec();

    return this.transformBidResponse(updatedBid);
  }

  /**
   * Withdraw Bid (Reverse Auction)
   * Allowed any time the bid is still PENDING. The "must be outbid"
   * precondition is removed — artists own their bid.
   */
  async withdrawBid(bidId: string, userId: string): Promise<void> {
    const bid = await BidModel.findById(bidId).exec();
    if (!bid) throw new NotFoundException('Bid not found');

    if (bid.artistId.toString() !== userId) {
      throw new ForbiddenException('Not authorized to withdraw this bid');
    }

    if (bid.status !== BidStatus.PENDING) {
      throw new BadRequestException('Can only withdraw pending bids');
    }

    bid.status = BidStatus.WITHDRAWN;
    await bid.save();

    // Decrement the gig's bid counter (active counters track non-terminal bids).
    await GigModel.updateOne(
      { _id: bid.gigId, bidCount: { $gt: 0 } },
      { $inc: { bidCount: -1 } }
    );
  }

  /**
   * Get Bids for a Gig (Client only)
   * Sorted by amount ascending (lowest first)
   */
  async getGigBids(gigId: string, userId: string): Promise<any[]> {
    const gig = await GigModel.findById(gigId).exec();
    if (!gig) throw new NotFoundException('Gig not found');

    if (gig.postedBy.toString() !== userId) {
      throw new ForbiddenException('Not authorized to view bids for this gig');
    }

    const bids = await BidModel.find({ gigId, status: BidStatus.PENDING })
      .populate('artistId', 'name profilePicture artistProfile')
      .sort({ amount: 1 }) // Lowest first
      .lean()
      .exec();

    return bids.map(bid => this.transformBidResponse(bid));
  }

  /**
   * Get My Bids (Artist only)
   */
  async getMyBids(userId: string, status?: BidStatus): Promise<any[]> {
    const filter: Record<string, unknown> = { artistId: userId };
    if (status) {
      filter.status = status;
    }

    const bids = await BidModel.find(filter)
      .populate('gigId', 'title budget eventTiming venue status')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // Add outbid status to each bid
    const bidsWithStatus = await Promise.all(
      bids.map(async (bid) => {
        const transformed = this.transformBidResponse(bid);
        if (bid.status === BidStatus.PENDING) {
          transformed.isOutbid = await this.isArtistOutbid(
            bid.gigId._id?.toString() || bid.gigId.toString(),
            bid.amount
          );
        }
        return transformed;
      })
    );

    return bidsWithStatus;
  }

  /**
   * Get a single bid by ID
   */
  async getBidById(bidId: string, userId: string): Promise<any> {
    const bid = await BidModel.findById(bidId)
      .populate('artistId', 'name profilePicture artistProfile')
      .populate('gigId', 'title budget eventTiming venue status postedBy')
      .lean()
      .exec();

    if (!bid) throw new NotFoundException('Bid not found');

    // Allow access if user is the artist who placed the bid or the client who owns the gig
    const gigDoc = bid.gigId as any;
    const isArtist = bid.artistId._id?.toString() === userId || bid.artistId.toString() === userId;
    const isClient = gigDoc?.postedBy?.toString() === userId;

    if (!isArtist && !isClient) {
      throw new ForbiddenException('Not authorized to view this bid');
    }

    const transformed = this.transformBidResponse(bid);
    // Add outbid status if it's the artist viewing and bid is pending
    if (isArtist && bid.status === BidStatus.PENDING) {
      transformed.isOutbid = await this.isArtistOutbid(
        gigDoc._id?.toString() || bid.gigId.toString(),
        bid.amount
      );
    }
    return transformed;
  }

  /**
   * Get bid status for an artist on a specific gig.
   * Used for real-time updates. Throws 404 if the gig itself doesn't exist
   * (so callers can distinguish "gig deleted" from "no bid yet").
   */
  async getArtistBidStatus(gigId: string, userId: string): Promise<any> {
    const gig = await GigModel.findById(gigId).select('_id').lean().exec();
    if (!gig) {
      throw new NotFoundException('Gig not found');
    }

    const bid = await BidModel.findOne({
      gigId,
      artistId: userId,
      status: BidStatus.PENDING,
    }).exec();

    if (!bid) {
      return { hasBid: false };
    }

    const isOutbid = await this.isArtistOutbid(gigId, bid.amount);
    const lowestBid = await this.getLowestBid(gigId);

    return {
      hasBid: true,
      bidId: bid._id.toString(),
      amount: bid.amount,
      isOutbid,
      isLowest: lowestBid?._id.toString() === bid._id.toString(),
      currentLowest: lowestBid?.amount,
    };
  }

  /**
   * Update Bid Status (Accept/Reject) - Client only
   *
   * Acceptance is the riskiest path: it must be atomic to prevent two
   * concurrent accepts (or an accept colliding with an application accept)
   * from double-booking a gig. We:
   *   1. Atomically claim the bid: PENDING -> ACCEPTED via findOneAndUpdate.
   *   2. Atomically claim the gig: only succeed if no other accepted entry
   *      already exists. If the gig claim fails, roll the bid back to PENDING.
   *   3. Auto-reject sibling pending bids and applications.
   */
  async updateBidStatus(bidId: string, userId: string, status: BidStatus): Promise<any> {
    if (status === BidStatus.ACCEPTED) {
      return this.acceptBid(bidId, userId);
    }
    if (status === BidStatus.REJECTED) {
      return this.rejectBid(bidId, userId);
    }
    throw new BadRequestException(`Unsupported status transition to ${status}`);
  }

  private async acceptBid(bidId: string, userId: string): Promise<any> {
    // Load bid (with gig) for ownership and pre-flight validation only.
    const probe = await BidModel.findById(bidId).populate('gigId').exec();
    if (!probe) throw new NotFoundException('Bid not found');

    const gig = probe.gigId as any;
    if (!gig) throw new NotFoundException('Gig not found');
    if (gig.postedBy.toString() !== userId) {
      throw new ForbiddenException('Not authorized to update this bid');
    }
    if (probe.status !== BidStatus.PENDING) {
      throw new BadRequestException(`Bid is already ${probe.status}`);
    }
    if (gig.status !== GigStatus.LIVE) {
      throw new BadRequestException('Can only accept bids for LIVE gigs');
    }

    // 1. Atomically transition bid PENDING -> ACCEPTED.
    const accepted = await BidModel.findOneAndUpdate(
      { _id: bidId, status: BidStatus.PENDING },
      { $set: { status: BidStatus.ACCEPTED } },
      { new: true }
    ).exec();
    if (!accepted) {
      // Lost the race: another writer already moved this bid out of PENDING.
      throw new ConflictException('Bid is no longer pending');
    }

    // 2. Atomically transition gig LIVE -> BOOKED only if nothing else has
    //    already claimed it (no acceptedBid and no acceptedApplicant).
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
          acceptedBid: accepted._id,
          acceptedArtist: accepted.artistId,
        },
      },
      { new: true }
    ).exec();

    if (!lockedGig) {
      // Roll back: someone else booked the gig first (rival bid or application).
      await BidModel.updateOne(
        { _id: accepted._id, status: BidStatus.ACCEPTED },
        { $set: { status: BidStatus.PENDING } }
      );
      throw new ConflictException(
        'Gig has already been awarded to another bid or applicant'
      );
    }

    // 3. Cross-reject pending siblings (both bids and applications).
    await BidModel.updateMany(
      {
        gigId: gig._id,
        _id: { $ne: accepted._id },
        status: BidStatus.PENDING,
      },
      { $set: { status: BidStatus.REJECTED } }
    );
    await ApplicationModel.updateMany(
      {
        gig: gig._id,
        status: ApplicationStatus.PENDING,
      },
      { $set: { status: ApplicationStatus.REJECTED } }
    );

    return this.transformBidResponse(accepted);
  }

  private async rejectBid(bidId: string, userId: string): Promise<any> {
    const bid = await BidModel.findById(bidId).populate('gigId').exec();
    if (!bid) throw new NotFoundException('Bid not found');

    const gig = bid.gigId as any;
    if (!gig) throw new NotFoundException('Gig not found');
    if (gig.postedBy.toString() !== userId) {
      throw new ForbiddenException('Not authorized to update this bid');
    }
    if (bid.status !== BidStatus.PENDING) {
      throw new BadRequestException(`Bid is already ${bid.status}`);
    }

    const updated = await BidModel.findOneAndUpdate(
      { _id: bidId, status: BidStatus.PENDING },
      { $set: { status: BidStatus.REJECTED } },
      { new: true }
    ).exec();
    if (!updated) {
      throw new ConflictException('Bid is no longer pending');
    }

    // Decrement bidCount because rejection removes it from the active pool.
    await GigModel.updateOne(
      { _id: gig._id, bidCount: { $gt: 0 } },
      { $inc: { bidCount: -1 } }
    );

    return this.transformBidResponse(updated);
  }

  /**
   * Transform Bid document to response format
   */
  private transformBidResponse(bid: any): any {
    const artistDoc = bid.artistId || {};
    const gigDoc = bid.gigId || {};

    const artist = artistDoc._id ? {
      id: artistDoc._id.toString(),
      name: artistDoc.name,
      profileImage: artistDoc.profilePicture,
      artistProfile: artistDoc.artistProfile ? {
        stageName: artistDoc.artistProfile.stageName,
        yearsOfExperience: artistDoc.artistProfile.yearsOfExperience,
        genres: artistDoc.artistProfile.genres,
        performanceTypes: artistDoc.artistProfile.performanceTypes,
      } : undefined,
    } : undefined;

    const gig = gigDoc._id ? {
      id: gigDoc._id.toString(),
      title: gigDoc.title,
      budget: gigDoc.budget,
      eventTiming: gigDoc.eventTiming,
      venue: gigDoc.venue,
      status: gigDoc.status,
      category: gigDoc.category,
    } : undefined;

    return {
      id: bid._id.toString(),
      gigId: gigDoc._id?.toString() || bid.gigId?.toString() || '',
      artistId: artistDoc._id?.toString() || bid.artistId?.toString() || '',
      amount: bid.amount,
      // The Mongoose schema stores the artist's pitch on `message`; expose it
      // as `proposal` to keep the API symmetrical with the applications model.
      proposal: bid.message,
      status: bid.status,
      createdAt: bid.createdAt,
      updatedAt: bid.updatedAt,
      artist,
      gig,
    };
  }

  /**
   * Get IDs of gigs where artist has active bids
   * Used to filter out already-applied gigs from discover
   */
  async getMyGigIds(userId: string): Promise<string[]> {
    const bids = await BidModel.find({
      artistId: userId,
      status: { $in: [BidStatus.PENDING, BidStatus.ACCEPTED] },
    })
      .select('gigId')
      .lean()
      .exec();

    return bids.map((bid) => bid.gigId.toString());
  }

  /**
   * Get Artist Dashboard Stats.
   *
   * `upcomingGigs` reflects accepted bids on gigs that are still BOOKED — i.e.
   * not yet started, not closed, not cancelled, not completed. Anything that
   * has progressed past BOOKED no longer belongs in the "upcoming" bucket.
   */
  async getArtistStats(userId: string): Promise<{
    activeBids: number;
    upcomingGigs: number;
    totalEarnings: number;
    completedGigs: number;
  }> {
    const now = new Date();

    // Count active (pending) bids
    const activeBids = await BidModel.countDocuments({
      artistId: userId,
      status: BidStatus.PENDING,
    }).exec();

    // Get accepted bids with gig info
    const acceptedBids = await BidModel.find({
      artistId: userId,
      status: BidStatus.ACCEPTED,
    })
      .populate('gigId', 'eventTiming status')
      .exec();

    // Upcoming = gig is still BOOKED *and* event date is in the future.
    const upcomingGigs = acceptedBids.filter((bid) => {
      const gig = bid.gigId as any;
      if (!gig?.eventTiming?.date) return false;
      return (
        gig.status === GigStatus.BOOKED &&
        new Date(gig.eventTiming.date) >= now
      );
    }).length;

    // Count completed gigs and sum earnings
    let totalEarnings = 0;
    let completedGigs = 0;
    acceptedBids.forEach((bid) => {
      const gig = bid.gigId as any;
      if (gig?.status === GigStatus.COMPLETED) {
        completedGigs++;
        totalEarnings += bid.amount;
      }
    });

    return {
      activeBids,
      upcomingGigs,
      totalEarnings,
      completedGigs,
    };
  }

  /**
   * Get Accepted Bids (Upcoming Events for Artist)
   */
  async getAcceptedBids(userId: string): Promise<any[]> {
    const now = new Date();

    const bids = await BidModel.find({
      artistId: userId,
      status: BidStatus.ACCEPTED,
    })
      .populate('gigId', 'title budget eventTiming venue status category postedBy')
      .populate({
        path: 'gigId',
        populate: {
          path: 'postedBy',
          select: 'name profilePicture email phoneNumber',
        },
      })
      .sort({ 'gigId.eventTiming.date': 1 })
      .lean()
      .exec();

    // Filter to only future events and transform
    return bids
      .filter((bid) => {
        const gig = bid.gigId as any;
        if (!gig?.eventTiming?.date) return false;
        return new Date(gig.eventTiming.date) >= now && gig.status !== GigStatus.COMPLETED;
      })
      .map((bid) => this.transformBidResponse(bid));
  }
}
