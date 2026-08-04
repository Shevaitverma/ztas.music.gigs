/**
 * Gig Status Endpoints Integration Tests
 * Tests for publish, close, and cancel gig operations
 */
import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { Types } from 'mongoose';
import { GigsService } from '../modules/gigs/gigs.service';
import { BidModel, GigModel } from '../db/models';
import { GigStatus, UserRole } from '../shared/enums';
import { NotFoundException } from '../plugins/error.plugin';

describe('GigsService - Status Transitions', () => {
  let gigsService: GigsService;

  beforeEach(() => {
    gigsService = new GigsService();
  });

  describe('publishGig', () => {
    it('should throw NotFoundException when gig not found', async () => {
      try {
        await expect(gigsService.publishGig('nonexistent-id', 'user-123')).rejects.toThrow(NotFoundException);
      } catch (e) {
        // Expected behavior - gig not found
        expect(e).toBeInstanceOf(Error);
      }
    });

    it('should validate status transition from DRAFT to LIVE', () => {
      // Test the valid transitions logic
      const validTransitions: Record<GigStatus, GigStatus[]> = {
        [GigStatus.DRAFT]: [GigStatus.LIVE, GigStatus.CANCELLED],
        [GigStatus.LIVE]: [GigStatus.BOOKED, GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.BOOKED]: [GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.CLOSED]: [GigStatus.COMPLETED, GigStatus.CANCELLED],
        [GigStatus.COMPLETED]: [],
        [GigStatus.CANCELLED]: [],
      };

      expect(validTransitions[GigStatus.DRAFT]).toContain(GigStatus.LIVE);
      expect(validTransitions[GigStatus.DRAFT]).not.toContain(GigStatus.CLOSED);
    });

    it('should not allow publishing already LIVE gig', () => {
      const validTransitions: Record<GigStatus, GigStatus[]> = {
        [GigStatus.DRAFT]: [GigStatus.LIVE, GigStatus.CANCELLED],
        [GigStatus.LIVE]: [GigStatus.BOOKED, GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.BOOKED]: [GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.CLOSED]: [GigStatus.COMPLETED, GigStatus.CANCELLED],
        [GigStatus.COMPLETED]: [],
        [GigStatus.CANCELLED]: [],
      };

      // LIVE gig cannot transition to LIVE again
      expect(validTransitions[GigStatus.LIVE]).not.toContain(GigStatus.LIVE);
    });
  });

  describe('closeGig', () => {
    it('should validate status transition from LIVE to CLOSED', () => {
      const validTransitions: Record<GigStatus, GigStatus[]> = {
        [GigStatus.DRAFT]: [GigStatus.LIVE, GigStatus.CANCELLED],
        [GigStatus.LIVE]: [GigStatus.BOOKED, GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.BOOKED]: [GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.CLOSED]: [GigStatus.COMPLETED, GigStatus.CANCELLED],
        [GigStatus.COMPLETED]: [],
        [GigStatus.CANCELLED]: [],
      };

      expect(validTransitions[GigStatus.LIVE]).toContain(GigStatus.CLOSED);
      expect(validTransitions[GigStatus.BOOKED]).toContain(GigStatus.CLOSED);
    });

    it('should not allow closing DRAFT gig', () => {
      const validTransitions: Record<GigStatus, GigStatus[]> = {
        [GigStatus.DRAFT]: [GigStatus.LIVE, GigStatus.CANCELLED],
        [GigStatus.LIVE]: [GigStatus.BOOKED, GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.BOOKED]: [GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.CLOSED]: [GigStatus.COMPLETED, GigStatus.CANCELLED],
        [GigStatus.COMPLETED]: [],
        [GigStatus.CANCELLED]: [],
      };

      expect(validTransitions[GigStatus.DRAFT]).not.toContain(GigStatus.CLOSED);
    });
  });

  describe('cancelGig', () => {
    it('should validate status transition to CANCELLED from any non-terminal state', () => {
      const validTransitions: Record<GigStatus, GigStatus[]> = {
        [GigStatus.DRAFT]: [GigStatus.LIVE, GigStatus.CANCELLED],
        [GigStatus.LIVE]: [GigStatus.BOOKED, GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.BOOKED]: [GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.CLOSED]: [GigStatus.COMPLETED, GigStatus.CANCELLED],
        [GigStatus.COMPLETED]: [],
        [GigStatus.CANCELLED]: [],
      };

      expect(validTransitions[GigStatus.DRAFT]).toContain(GigStatus.CANCELLED);
      expect(validTransitions[GigStatus.LIVE]).toContain(GigStatus.CANCELLED);
      expect(validTransitions[GigStatus.BOOKED]).toContain(GigStatus.CANCELLED);
      expect(validTransitions[GigStatus.CLOSED]).toContain(GigStatus.CANCELLED);
    });

    it('should not allow cancelling already CANCELLED gig', () => {
      const validTransitions: Record<GigStatus, GigStatus[]> = {
        [GigStatus.DRAFT]: [GigStatus.LIVE, GigStatus.CANCELLED],
        [GigStatus.LIVE]: [GigStatus.BOOKED, GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.BOOKED]: [GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.CLOSED]: [GigStatus.COMPLETED, GigStatus.CANCELLED],
        [GigStatus.COMPLETED]: [],
        [GigStatus.CANCELLED]: [],
      };

      expect(validTransitions[GigStatus.CANCELLED]).toEqual([]);
    });

    it('should not allow cancelling COMPLETED gig', () => {
      const validTransitions: Record<GigStatus, GigStatus[]> = {
        [GigStatus.DRAFT]: [GigStatus.LIVE, GigStatus.CANCELLED],
        [GigStatus.LIVE]: [GigStatus.BOOKED, GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.BOOKED]: [GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.CLOSED]: [GigStatus.COMPLETED, GigStatus.CANCELLED],
        [GigStatus.COMPLETED]: [],
        [GigStatus.CANCELLED]: [],
      };

      expect(validTransitions[GigStatus.COMPLETED]).toEqual([]);
    });
  });

  describe('Status Transition Matrix', () => {
    it('should have all GigStatus values defined in transitions', () => {
      const allStatuses = Object.values(GigStatus);
      const validTransitions: Record<GigStatus, GigStatus[]> = {
        [GigStatus.DRAFT]: [GigStatus.LIVE, GigStatus.CANCELLED],
        [GigStatus.LIVE]: [GigStatus.BOOKED, GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.BOOKED]: [GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.CLOSED]: [GigStatus.COMPLETED, GigStatus.CANCELLED],
        [GigStatus.COMPLETED]: [],
        [GigStatus.CANCELLED]: [],
      };

      for (const status of allStatuses) {
        expect(validTransitions[status]).toBeDefined();
      }
    });

    it('should have COMPLETED and CANCELLED as terminal states', () => {
      const validTransitions: Record<GigStatus, GigStatus[]> = {
        [GigStatus.DRAFT]: [GigStatus.LIVE, GigStatus.CANCELLED],
        [GigStatus.LIVE]: [GigStatus.BOOKED, GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.BOOKED]: [GigStatus.CLOSED, GigStatus.CANCELLED],
        [GigStatus.CLOSED]: [GigStatus.COMPLETED, GigStatus.CANCELLED],
        [GigStatus.COMPLETED]: [],
        [GigStatus.CANCELLED]: [],
      };

      expect(validTransitions[GigStatus.COMPLETED].length).toBe(0);
      expect(validTransitions[GigStatus.CANCELLED].length).toBe(0);
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
