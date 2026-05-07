import { VenueModel, Venue } from '../../db/models';
import { NotFoundException, ForbiddenException, BadRequestException } from '../../plugins/error.plugin';

/**
 * Venues Service
 */
export class VenuesService {
  /**
   * Create Venue
   */
  async createVenue(userId: string, dto: any): Promise<any> {
    const venueDoc = new VenueModel({
      ...dto,
      owner: userId,
    });
    const venue = await venueDoc.save();

    const populated = await VenueModel.findById(venue._id)
      .populate('owner', 'name profilePicture')
      .exec();

    return this.transformVenueResponse(populated);
  }

  /**
   * Get My Venues
   */
  async getMyVenues(userId: string): Promise<any[]> {
    const venues = await VenueModel.find({ owner: userId })
      .sort({ createdAt: -1 })
      .exec();

    return venues.map(venue => this.transformVenueResponse(venue));
  }

  /**
   * Get Venue by ID
   */
  async getVenue(id: string): Promise<any> {
    const venue = await VenueModel.findById(id)
      .populate('owner', 'name profilePicture')
      .exec();

    if (!venue) throw new NotFoundException('Venue not found');

    return this.transformVenueResponse(venue);
  }

  /**
   * Update Venue
   */
  async updateVenue(id: string, userId: string, dto: any): Promise<any> {
    const venue = await VenueModel.findById(id).exec();
    if (!venue) throw new NotFoundException('Venue not found');

    if (venue.owner.toString() !== userId) {
      throw new ForbiddenException('Not authorized to update this venue');
    }

    Object.assign(venue, dto);
    await venue.save();

    const populated = await VenueModel.findById(venue._id)
      .populate('owner', 'name profilePicture')
      .exec();

    return this.transformVenueResponse(populated);
  }

  /**
   * Delete Venue
   */
  async deleteVenue(id: string, userId: string): Promise<void> {
    const venue = await VenueModel.findById(id).exec();
    if (!venue) throw new NotFoundException('Venue not found');

    if (venue.owner.toString() !== userId) {
      throw new ForbiddenException('Not authorized to delete this venue');
    }

    await venue.deleteOne();
  }

  /**
   * Search Venues (Internal/Admin/Client use)
   */
  async searchVenues(params: {
    query?: string;
    city?: string;
  }): Promise<any[]> {
    const filter: any = {};

    if (params.query) {
      filter.$text = { $search: params.query };
    }

    if (params.city) {
      filter.city = { $regex: params.city, $options: 'i' };
    }

    const venues = await VenueModel.find(filter).limit(20).exec();

    return venues.map(venue => this.transformVenueResponse(venue));
  }

  /**
   * Transform Venue document to response format (matches NestJS VenueResponseDto)
   */
  private transformVenueResponse(venue: any): any {
    const owner = venue.owner || {};

    return {
      id: venue._id.toString(),
      name: venue.name,
      address: venue.address,
      city: venue.city,
      state: venue.state,
      pincode: venue.pincode,
      coordinates: venue.coordinates,
      capacity: venue.capacity,
      venueType: venue.venueType,
      amenities: venue.amenities,
      images: venue.images,
      owner: {
        id: owner._id?.toString() || venue.owner?.toString() || '',
        name: owner.name,
        profilePicture: owner.profilePicture,
      },
      createdAt: venue.createdAt,
      updatedAt: venue.updatedAt,
    };
  }
}
