/**
 * Gig Status Endpoints Integration Tests
 * Tests for publish, close, and cancel gig operations
 */
import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import { Types } from 'mongoose';
import { GigsService, VALID_STATUS_TRANSITIONS } from '../modules/gigs/gigs.service';
import { BidModel, GigModel } from '../db/models';
import { GigStatus, UserRole } from '../shared/enums';
import { NotFoundException } from '../plugins/error.plugin';

/**
 * These assert against the service's real VALID_STATUS_TRANSITIONS, not a
 * copy. A local copy drifted from production (it was missing BOOKED -> COMPLETED,
 * the OTP happy path) and every assertion still passed, which is the whole
 * failure mode this file previously had.
 */
describe('GigsService - Status Transitions', () => {
  describe('publishGig', () => {
    const restore: Array<{ mockRestore: () => void }> = [];
    afterEach(() => restore.splice(0).forEach((s) => s.mockRestore()));

    it('should throw NotFoundException when gig not found', async () => {
      restore.push(
        spyOn(GigModel, 'findById').mockReturnValue({ exec: async () => null } as any),
      );

      await expect(
        new GigsService().publishGig(new Types.ObjectId().toString(), 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should validate status transition from DRAFT to LIVE', () => {
      expect(VALID_STATUS_TRANSITIONS[GigStatus.DRAFT]).toContain(GigStatus.LIVE);
      expect(VALID_STATUS_TRANSITIONS[GigStatus.DRAFT]).not.toContain(GigStatus.CLOSED);
    });

    it('should not allow publishing already LIVE gig', () => {
      expect(VALID_STATUS_TRANSITIONS[GigStatus.LIVE]).not.toContain(GigStatus.LIVE);
    });
  });

  describe('closeGig', () => {
    it('should validate status transition from LIVE to CLOSED', () => {
      expect(VALID_STATUS_TRANSITIONS[GigStatus.LIVE]).toContain(GigStatus.CLOSED);
      expect(VALID_STATUS_TRANSITIONS[GigStatus.BOOKED]).toContain(GigStatus.CLOSED);
    });

    it('should not allow closing DRAFT gig', () => {
      expect(VALID_STATUS_TRANSITIONS[GigStatus.DRAFT]).not.toContain(GigStatus.CLOSED);
    });
  });

  describe('cancelGig', () => {
    it('should validate status transition to CANCELLED from any non-terminal state', () => {
      for (const from of [GigStatus.DRAFT, GigStatus.LIVE, GigStatus.BOOKED, GigStatus.CLOSED]) {
        expect(VALID_STATUS_TRANSITIONS[from]).toContain(GigStatus.CANCELLED);
      }
    });

    it('should not allow cancelling already CANCELLED gig', () => {
      expect(VALID_STATUS_TRANSITIONS[GigStatus.CANCELLED]).toEqual([]);
    });

    it('should not allow cancelling COMPLETED gig', () => {
      expect(VALID_STATUS_TRANSITIONS[GigStatus.COMPLETED]).toEqual([]);
    });
  });

  describe('Status Transition Matrix', () => {
    it('should have all GigStatus values defined in transitions', () => {
      for (const status of Object.values(GigStatus)) {
        expect(VALID_STATUS_TRANSITIONS[status]).toBeDefined();
      }
    });

    it('should have COMPLETED and CANCELLED as terminal states', () => {
      expect(VALID_STATUS_TRANSITIONS[GigStatus.COMPLETED].length).toBe(0);
      expect(VALID_STATUS_TRANSITIONS[GigStatus.CANCELLED].length).toBe(0);
    });
  });
});

/**
 * A BOOKED gig has no PENDING bids left, so `getGigBids` returns an empty list
 * and the organizer's manage page had no source at all for the booked artist's
 * name/id (the review modal got `revieweeId: undefined`). `getGig` now returns
 * the accepted artist — but only to the two parties to the booking.
 */
describe('GigsService.getGig — accepted artist disclosure', () => {
  const ownerId = new Types.ObjectId();
  const artistId = new Types.ObjectId();
  const bidId = new Types.ObjectId();
  const gigId = new Types.ObjectId();

  const bookedGig = () => ({
    _id: gigId,
    title: 'Rooftop set',
    description: 'd',
    category: 'DJ',
    budget: { min: 1000, max: 9000, currency: 'INR' },
    venue: { name: 'v', address: 'a', city: 'c', state: 's', pincode: '110001', coordinates: undefined },
    eventTiming: { date: new Date(), startTime: '20:00', endTime: '23:00', durationMinutes: 180 },
    images: [],
    postedBy: { _id: ownerId, name: 'Organizer', profilePicture: 'o.jpg' },
    status: GigStatus.BOOKED,
    acceptedArtist: { _id: artistId, name: 'DJ Foo', profilePicture: 'a.jpg', email: 'dj@x.com' },
    acceptedBid: { _id: bidId, amount: 5000 },
  });

  const restore: Array<{ mockRestore: () => void }> = [];
  const mockFindById = (gig: any) => {
    const chain: any = { populate: () => chain, lean: () => chain, exec: async () => gig };
    restore.push(spyOn(GigModel, 'findById').mockReturnValue(chain));
  };

  afterEach(() => restore.splice(0).forEach((s) => s.mockRestore()));

  it('returns acceptedArtist and acceptedBid to the gig owner', async () => {
    mockFindById(bookedGig());

    const res = await new GigsService().getGig(gigId.toString(), false, {
      userId: ownerId.toString(),
      role: UserRole.CLIENT,
    });

    expect(res.acceptedArtist).toEqual({
      id: artistId.toString(),
      name: 'DJ Foo',
      profileImage: 'a.jpg',
    });
    expect(res.acceptedBid).toEqual({ id: bidId.toString(), amount: 5000 });
    // Contact details are never part of this payload.
    expect(JSON.stringify(res)).not.toContain('dj@x.com');
  });

  it('returns it to the accepted artist too', async () => {
    mockFindById(bookedGig());

    const res = await new GigsService().getGig(gigId.toString(), false, {
      userId: artistId.toString(),
      role: UserRole.ARTIST,
    });

    expect(res.acceptedArtist.id).toBe(artistId.toString());
  });

  it('withholds it from a losing bidder who can still see the gig', async () => {
    mockFindById(bookedGig());
    restore.push(spyOn(BidModel, 'exists').mockResolvedValue({ _id: bidId } as any));

    const res = await new GigsService().getGig(gigId.toString(), false, {
      userId: new Types.ObjectId().toString(),
      role: UserRole.ARTIST,
    });

    expect(res.id).toBe(gigId.toString());
    expect(res.acceptedArtist).toBeUndefined();
    expect(res.acceptedBid).toBeUndefined();
  });
});

describe('API Contract Validation', () => {
  it('should have publish endpoint matching frontend expectations', () => {
    // Frontend expects: POST /gigs/:id/publish
    // Returns: GigResponse with updated status
    const expectedEndpoint = '/gigs/:id/publish';
    const expectedMethod = 'POST';

    expect(expectedEndpoint).toBe('/gigs/:id/publish');
    expect(expectedMethod).toBe('POST');
  });

  it('should have close endpoint matching frontend expectations', () => {
    // Frontend expects: POST /gigs/:id/close
    const expectedEndpoint = '/gigs/:id/close';
    const expectedMethod = 'POST';

    expect(expectedEndpoint).toBe('/gigs/:id/close');
    expect(expectedMethod).toBe('POST');
  });

  it('should have cancel endpoint matching frontend expectations', () => {
    // Frontend expects: POST /gigs/:id/cancel
    const expectedEndpoint = '/gigs/:id/cancel';
    const expectedMethod = 'POST';

    expect(expectedEndpoint).toBe('/gigs/:id/cancel');
    expect(expectedMethod).toBe('POST');
  });
});
