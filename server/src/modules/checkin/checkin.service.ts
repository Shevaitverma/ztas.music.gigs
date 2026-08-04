import * as nodeCrypto from 'node:crypto';
import { EventCheckInModel, GigModel, EventCheckIn, NotificationType } from '../../db/models';
import { notificationsService } from '../notifications/notifications.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '../../plugins/error.plugin';
import { HttpException } from '../../shared/errors/custom-errors';
import { CheckInStatus, GigStatus } from '../../shared/enums';
import { geoDistanceMeters, OTP_GPS_TOLERANCE_METERS } from '../../shared/utils/geo';
import { eventEndsAt, eventStartsAt, type EventTimingLike } from '../../shared/utils/event-time';
import type { CheckInResponse, OtpResponse, VerifyOtpDto } from './checkin.schemas';
import type { GigsService } from '../gigs/gigs.service';

/**
 * Maximum number of OTP regenerations allowed
 */
const MAX_OTP_REGENERATIONS = 3;

/**
 * OTP validity duration in milliseconds (event end time + 1 hour buffer)
 */
const OTP_BUFFER_HOURS = 1;

/**
 * Brute-force guard: number of failed OTP attempts before locking the record.
 */
const MAX_OTP_ATTEMPTS = 5;

/**
 * How long to lock OTP verification after exceeding MAX_OTP_ATTEMPTS.
 */
const OTP_LOCK_DURATION_MS = 15 * 60 * 1000;

/**
 * Check-In Service
 * Handles event check-in workflow with OTP verification.
 *
 * Composes GigsService so the BOOKED -> COMPLETED transition that fires when
 * the event ends goes through the same state-machine validator the rest of
 * the gig lifecycle uses (no raw findByIdAndUpdate bypasses).
 */
export class CheckInService {
  constructor(private readonly gigsService: GigsService) {}

  /**
   * Generate 6-digit OTP code using a CSPRNG (uniform over [100000, 999999]).
   * Math.random() is not cryptographically secure and must not be used for
   * authentication codes.
   */
  private createOtpCode(): string {
    return nodeCrypto.randomInt(100000, 1000000).toString();
  }

  /**
   * Calculate OTP expiration: event end + buffer.
   *
   * `eventEndsAt` resolves the "HH:mm" end time against the app timezone (and
   * rolls overnight events — 22:00 -> 02:00 — onto the next calendar day), so
   * expiry lands on the right real-world instant no matter what TZ the server
   * process runs in.
   */
  private calculateOtpExpiry(timing: EventTimingLike): Date {
    return new Date(eventEndsAt(timing).getTime() + OTP_BUFFER_HOURS * 60 * 60 * 1000);
  }

  /**
   * Generate OTP for an event (Organizer only)
   * Can only generate OTP when:
   * - Gig status is BOOKED
   * - There's an accepted bid
   * - Event date is today or within 30 mins before start
   */
  async generateOtp(gigId: string, userId: string): Promise<CheckInResponse> {
    const gig = await GigModel.findById(gigId).exec();
    if (!gig) throw new NotFoundException('Gig not found');

    // Verify organizer
    if (gig.postedBy.toString() !== userId) {
      throw new ForbiddenException('Only the gig organizer can generate OTP');
    }

    // Check gig status
    if (gig.status !== GigStatus.BOOKED) {
      throw new BadRequestException('Can only generate OTP for BOOKED gigs');
    }

    // Verify accepted bid exists
    if (!gig.acceptedBid || !gig.acceptedArtist) {
      throw new BadRequestException('No accepted bid for this gig');
    }

    // Check if within valid time window (30 mins before the event starts).
    // The start instant is resolved in the app timezone, not the server's.
    const now = new Date();
    const earliestOtpTime = new Date(
      eventStartsAt(gig.eventTiming).getTime() - 30 * 60 * 1000
    );

    if (now < earliestOtpTime) {
      throw new BadRequestException(
        'OTP can only be generated 30 minutes before the event starts'
      );
    }

    // Check for existing check-in record
    let checkIn = await EventCheckInModel.findOne({ gig: gigId }).exec();

    if (checkIn) {
      // If already checked in or beyond, cannot regenerate
      if (checkIn.status !== CheckInStatus.PENDING) {
        throw new BadRequestException(`Cannot regenerate OTP when status is ${checkIn.status}`);
      }

      // Check regeneration limit
      if (checkIn.otpRegenerateCount >= MAX_OTP_REGENERATIONS) {
        throw new BadRequestException(
          `Maximum OTP regenerations (${MAX_OTP_REGENERATIONS}) reached`
        );
      }

      // Regenerate OTP
      checkIn.otp = this.createOtpCode();
      checkIn.otpGeneratedAt = now;
      checkIn.otpExpiresAt = this.calculateOtpExpiry(gig.eventTiming);
      checkIn.otpRegenerateCount += 1;
      // Reset brute-force counters on regeneration so the artist isn't
      // locked out by a stale lock from a previous OTP value.
      checkIn.otpAttempts = 0;
      checkIn.otpLockedUntil = undefined;
      await checkIn.save();
    } else {
      // Create new check-in record
      checkIn = new EventCheckInModel({
        gig: gigId,
        bid: gig.acceptedBid,
        artist: gig.acceptedArtist,
        organizer: userId,
        otp: this.createOtpCode(),
        otpGeneratedAt: now,
        otpExpiresAt: this.calculateOtpExpiry(gig.eventTiming),
        otpRegenerateCount: 0,
        otpAttempts: 0,
        status: CheckInStatus.PENDING,
      });
      await checkIn.save();
    }

    // Fire-and-forget: `create` never throws, so a delivery failure cannot
    // block the organizer from getting their OTP.
    // NOTE: the OTP itself is deliberately NOT included — the artist reads it
    // off the organizer's screen at the venue; emailing it defeats the check.
    void notificationsService.create({
      userId: gig.acceptedArtist,
      type: NotificationType.CHECKIN_OTP_READY,
      title: `Check-in is open for "${gig.title}"`,
      message: `The organizer has generated your check-in code for "${gig.title}". Ask them for the 6-digit OTP at the venue to check in.`,
      data: { gigId: gig._id.toString(), checkInId: checkIn._id.toString() },
    });

    return this.transformCheckInResponse(checkIn, true);
  }

  /**
   * Get current OTP (Organizer only)
   */
  async getOtp(gigId: string, userId: string): Promise<OtpResponse> {
    const gig = await GigModel.findById(gigId).exec();
    if (!gig) throw new NotFoundException('Gig not found');

    if (gig.postedBy.toString() !== userId) {
      throw new ForbiddenException('Only the gig organizer can view OTP');
    }

    const checkIn = await EventCheckInModel.findOne({ gig: gigId }).exec();
    if (!checkIn) {
      throw new NotFoundException('No OTP generated for this gig yet');
    }

    return {
      otp: checkIn.otp,
      expiresAt: checkIn.otpExpiresAt,
      regenerateCount: checkIn.otpRegenerateCount,
      maxRegenerations: MAX_OTP_REGENERATIONS,
    };
  }

  /**
   * Verify OTP and check-in (Artist only).
   *
   * GPS verification: location is REQUIRED at the route layer. The artist's
   * reported coordinates must be within OTP_GPS_TOLERANCE_METERS of the gig
   * venue's stored geoPoint. If the venue has no geoPoint (legacy gigs), we
   * skip the distance check but still record the artist's location and log
   * a warning so this can be observed in production.
   *
   * Transitions status: PENDING -> CHECKED_IN
   */
  async verifyOtp(userId: string, dto: VerifyOtpDto): Promise<CheckInResponse> {
    const checkIn = await EventCheckInModel.findOne({ gig: dto.gigId }).exec();
    if (!checkIn) {
      throw new NotFoundException('No check-in record found for this gig');
    }

    // Verify artist
    if (checkIn.artist.toString() !== userId) {
      throw new ForbiddenException('Only the booked artist can verify OTP');
    }

    // Check status
    if (checkIn.status !== CheckInStatus.PENDING) {
      throw new BadRequestException(`Cannot check in when status is ${checkIn.status}`);
    }

    // Check OTP expiry
    if (new Date() > checkIn.otpExpiresAt) {
      checkIn.status = CheckInStatus.EXPIRED;
      await checkIn.save();
      throw new BadRequestException('OTP has expired');
    }

    // Brute-force guard: refuse verification if the record is currently locked.
    const nowTs = new Date();
    if (checkIn.otpLockedUntil && checkIn.otpLockedUntil > nowTs) {
      const retryMs = checkIn.otpLockedUntil.getTime() - nowTs.getTime();
      throw new HttpException(
        429,
        `Too many failed OTP attempts. Try again in ${Math.ceil(retryMs / 60000)} minute(s).`
      );
    }

    // Constant-time OTP comparison.
    const expected = Buffer.from(checkIn.otp, 'utf8');
    const provided = Buffer.from(String(dto.otp ?? ''), 'utf8');
    const otpMatches =
      expected.length === provided.length &&
      nodeCrypto.timingSafeEqual(expected, provided);

    if (!otpMatches) {
      checkIn.otpAttempts = (checkIn.otpAttempts ?? 0) + 1;
      if (checkIn.otpAttempts >= MAX_OTP_ATTEMPTS) {
        checkIn.otpLockedUntil = new Date(nowTs.getTime() + OTP_LOCK_DURATION_MS);
      }
      await checkIn.save();
      throw new BadRequestException('Invalid OTP');
    }

    // Successful match: clear failed-attempt counters.
    checkIn.otpAttempts = 0;
    checkIn.otpLockedUntil = undefined;

    // GPS verification — location is required at the schema level. Look up the
    // gig's venue geoPoint (or legacy coordinates) and ensure the artist is
    // physically within tolerance. Without a venue point, we proceed with a
    // logged warning so legacy gigs still work.
    const gig = await GigModel.findById(dto.gigId).select('venue').lean().exec();
    let venueLat: number | undefined;
    let venueLng: number | undefined;
    if (gig?.venue?.geoPoint?.coordinates?.length === 2) {
      // GeoJSON is [lng, lat].
      venueLng = gig.venue.geoPoint.coordinates[0];
      venueLat = gig.venue.geoPoint.coordinates[1];
    } else if (
      gig?.venue?.coordinates?.lat !== undefined &&
      gig?.venue?.coordinates?.lng !== undefined
    ) {
      venueLat = gig.venue.coordinates.lat;
      venueLng = gig.venue.coordinates.lng;
    }

    if (venueLat !== undefined && venueLng !== undefined) {
      const distance = geoDistanceMeters(
        dto.location.lat,
        dto.location.lng,
        venueLat,
        venueLng
      );
      if (distance > OTP_GPS_TOLERANCE_METERS) {
        throw new BadRequestException(
          `You appear to be ${Math.round(distance)}m from the venue. ` +
          `Check-in requires you to be within ${OTP_GPS_TOLERANCE_METERS}m.`
        );
      }
    } else {
      console.warn(
        `[checkin] Gig ${dto.gigId} has no venue geo coordinates; skipping ` +
        `GPS verification for OTP check-in.`
      );
    }

    // Update check-in status
    checkIn.status = CheckInStatus.CHECKED_IN;
    checkIn.artistCheckedInAt = new Date();

    // Capture location (always present at this point).
    checkIn.artistLocation = {
      lat: dto.location.lat,
      lng: dto.location.lng,
      capturedAt: new Date(),
    };

    await checkIn.save();
    return this.transformCheckInResponse(checkIn, false);
  }

  /**
   * Start Event (Organizer only)
   *
   * Allowing artist-only confirmation here would let an artist forge progress
   * without the organizer's knowledge. The trust model puts the venue/client
   * in control of declaring the event started.
   *
   * Transitions status: CHECKED_IN -> EVENT_STARTED
   */
  async startEvent(gigId: string, userId: string): Promise<CheckInResponse> {
    const checkIn = await EventCheckInModel.findOne({ gig: gigId }).exec();
    if (!checkIn) {
      throw new NotFoundException('No check-in record found');
    }

    const isOrganizer = checkIn.organizer.toString() === userId;

    if (!isOrganizer) {
      throw new ForbiddenException('Only the organizer can start the event');
    }

    // Check status
    if (checkIn.status !== CheckInStatus.CHECKED_IN) {
      throw new BadRequestException(
        `Cannot start event when status is ${checkIn.status}. Artist must check in first.`
      );
    }

    // Start the event
    checkIn.status = CheckInStatus.EVENT_STARTED;
    checkIn.eventStartedAt = new Date();
    await checkIn.save();

    return this.transformCheckInResponse(checkIn, isOrganizer);
  }

  /**
   * End Event (Both parties must confirm).
   *
   * Idempotency + state-machine: the BOOKED -> COMPLETED transition for the
   * gig is funneled through gigsService.completeGigFromCheckIn, which
   * conditionally updates the gig only if it is still BOOKED. If the gig has
   * already moved on (e.g. cancelled, completed by another path), that
   * helper throws 409, and we surface the error to the caller.
   *
   * Transitions status: EVENT_STARTED -> EVENT_ENDED (when both confirm)
   */
  async endEvent(gigId: string, userId: string): Promise<CheckInResponse> {
    const checkIn = await EventCheckInModel.findOne({ gig: gigId }).exec();
    if (!checkIn) {
      throw new NotFoundException('No check-in record found');
    }

    // Verify user is either artist or organizer
    const isOrganizer = checkIn.organizer.toString() === userId;
    const isArtist = checkIn.artist.toString() === userId;

    if (!isOrganizer && !isArtist) {
      throw new ForbiddenException('Only the organizer or artist can end the event');
    }

    // Surface a clearer message when the event has already ended (vs. "not
    // started yet"), so clients aren't told to do something already done.
    if (checkIn.status === CheckInStatus.EVENT_ENDED) {
      throw new BadRequestException('Event has already ended');
    }

    if (checkIn.status !== CheckInStatus.EVENT_STARTED) {
      throw new BadRequestException(
        `Cannot end event when status is ${checkIn.status}. Event must be started first.`
      );
    }

    // Update confirmation
    if (!checkIn.endConfirmation) {
      checkIn.endConfirmation = {
        organizerConfirmed: false,
        artistConfirmed: false,
      };
    }

    const now = new Date();
    if (isOrganizer && !checkIn.endConfirmation.organizerConfirmed) {
      checkIn.endConfirmation.organizerConfirmed = true;
      checkIn.endConfirmation.organizerEndedAt = now;
    }

    if (isArtist && !checkIn.endConfirmation.artistConfirmed) {
      checkIn.endConfirmation.artistConfirmed = true;
      checkIn.endConfirmation.artistEndedAt = now;
    }

    // Check if both confirmed
    const bothConfirmed =
      checkIn.endConfirmation.organizerConfirmed &&
      checkIn.endConfirmation.artistConfirmed;

    if (bothConfirmed) {
      // Drive the gig completion through the validated, idempotent helper
      // BEFORE flipping the check-in to EVENT_ENDED. If the gig isn't BOOKED
      // anymore (cancelled/completed elsewhere), this throws 409 and we
      // surface the conflict without mutating the check-in record.
      await this.gigsService.completeGigFromCheckIn(gigId);
      checkIn.status = CheckInStatus.EVENT_ENDED;
      checkIn.eventEndedAt = now;
    }

    // Mark as modified for Mongoose to detect nested object changes
    checkIn.markModified('endConfirmation');
    await checkIn.save();

    return this.transformCheckInResponse(checkIn, isOrganizer);
  }

  /**
   * Get Check-in Status (Both parties can view)
   */
  async getStatus(gigId: string, userId: string): Promise<CheckInResponse> {
    const checkIn = await EventCheckInModel.findOne({ gig: gigId }).exec();
    if (!checkIn) {
      throw new NotFoundException('No check-in record found');
    }

    // Verify user is either artist or organizer
    const isOrganizer = checkIn.organizer.toString() === userId;
    const isArtist = checkIn.artist.toString() === userId;

    if (!isOrganizer && !isArtist) {
      throw new ForbiddenException(
        'Only the organizer or artist can view check-in status'
      );
    }

    return this.transformCheckInResponse(checkIn, isOrganizer);
  }

  /**
   * Cancel Check-in (Organizer only, before event starts).
   *
   * Cancelling the check-in implies the gig itself is being torn down.
   * Funnel the cascade through gigsService.cancelGig so the gig drops back
   * out of BOOKED, accepted bids/applicants are flipped to CANCELLED, and
   * the EventCheckIn is marked CANCELLED in one consistent operation.
   */
  async cancelCheckIn(gigId: string, userId: string): Promise<CheckInResponse> {
    const checkIn = await EventCheckInModel.findOne({ gig: gigId }).exec();
    if (!checkIn) {
      throw new NotFoundException('No check-in record found');
    }

    // Verify organizer
    if (checkIn.organizer.toString() !== userId) {
      throw new ForbiddenException('Only the organizer can cancel check-in');
    }

    // Can only cancel if event hasn't started
    if (
      checkIn.status === CheckInStatus.EVENT_STARTED ||
      checkIn.status === CheckInStatus.EVENT_ENDED
    ) {
      throw new BadRequestException('Cannot cancel after event has started');
    }

    // Drive the cancel through GigsService.cancelGig — it cascades into the
    // EventCheckIn record (sets it to CANCELLED) and rolls the gig out of
    // BOOKED, plus flips accepted bids/applicants. We then re-read the
    // updated check-in to return a fresh response.
    await this.gigsService.cancelGig(gigId, userId);

    const refreshed = await EventCheckInModel.findOne({ gig: gigId }).exec();
    if (!refreshed) {
      // Should not happen — cancelGig only updates, doesn't delete.
      throw new ConflictException('Check-in record disappeared during cancel');
    }

    return this.transformCheckInResponse(refreshed, true);
  }

  /**
   * Transform EventCheckIn document to response
   */
  private transformCheckInResponse(
    checkIn: EventCheckIn,
    includeOtp: boolean
  ): CheckInResponse {
    return {
      id: checkIn._id.toString(),
      gigId: checkIn.gig.toString(),
      bidId: checkIn.bid.toString(),
      artistId: checkIn.artist.toString(),
      organizerId: checkIn.organizer.toString(),
      status: checkIn.status,
      // Only include OTP for organizer
      otp: includeOtp ? checkIn.otp : undefined,
      otpExpiresAt: includeOtp ? checkIn.otpExpiresAt : undefined,
      otpRegenerateCount: includeOtp ? checkIn.otpRegenerateCount : undefined,
      artistCheckedInAt: checkIn.artistCheckedInAt,
      eventStartedAt: checkIn.eventStartedAt,
      eventEndedAt: checkIn.eventEndedAt,
      endConfirmation: checkIn.endConfirmation
        ? {
            organizerConfirmed: checkIn.endConfirmation.organizerConfirmed,
            artistConfirmed: checkIn.endConfirmation.artistConfirmed,
          }
        : undefined,
      artistLocation: checkIn.artistLocation
        ? {
            lat: checkIn.artistLocation.lat,
            lng: checkIn.artistLocation.lng,
            capturedAt: checkIn.artistLocation.capturedAt,
          }
        : undefined,
      createdAt: checkIn.createdAt,
      updatedAt: checkIn.updatedAt,
    };
  }
}
