import { UserModel, User, ArtistProfile, ClientProfile } from '../../db/models';
import { BadRequestException, NotFoundException } from '../../plugins/error.plugin';
import { UserRole, UserStatus } from '../../shared/enums';
import { s3Service } from '../../services/s3.service';
import { escapeRegex } from '../../shared/utils/validation.utils';
import { randomUUID } from 'node:crypto';
import type {
  UserProfileResponse,
  PublicUserProfile,
  UpdateProfileDto,
  ArtistProfileResponse,
} from '../../shared/types/user.types';

// Export types needed by routes
export type { UpdateProfileDto, ArtistProfileResponse };

/**
 * Detect image MIME type from magic bytes.
 *
 * Returns `null` if the buffer doesn't match any of the supported image
 * formats — caller should reject the upload.
 */
function detectImageMime(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  // GIF: 47 49 46 38 (37|39) 61
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return { mime: 'image/gif', ext: 'gif' };
  }
  // WebP: RIFF????WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

/**
 * Users Service
 * Handles all user-related business logic
 */
export class UsersService {
  /**
   * Get user profile by ID
   */
  async getProfile(userId: string): Promise<UserProfileResponse> {
    const user = await UserModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.transformUserResponse(user);
  }

  /**
   * Get public profile (limited information).
   *
   * SECURITY (H9): explicit allow-list — never includes email, phone,
   * firebaseUid, lastLogin, refreshToken, password.
   */
  async getPublicProfile(userId: string): Promise<PublicUserProfile> {
    const user = await UserModel.findById(userId)
      .select(
        '_id name profilePicture role isVerified artistProfile clientProfile createdAt'
      )
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.transformPublicProfile(user);
  }

  /**
   * Update user profile.
   *
   * SECURITY (M8): explicit allow-list for self-update — `email` and
   * `phoneNumber` cannot be changed via this endpoint (they're tied to
   * Firebase auth and must go through the verified-OTP / verified-email flow).
   * `dto` is NEVER spread onto the user document.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfileResponse> {
    const user = await UserModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Allow-list of self-updatable basic fields.
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.profilePicture !== undefined) user.profilePicture = dto.profilePicture;
    // NOTE: email and phoneNumber are intentionally NOT writable here. Changes
    // must flow through the auth verification path (Firebase OTP / Google).

    // Update Artist Profile (deep merge)
    if (dto.artistProfile && user.role === UserRole.ARTIST) {
      user.artistProfile = this.mergeArtistProfile(
        user.artistProfile || ({} as ArtistProfile),
        dto.artistProfile
      );
    }

    // Update Client Profile (deep merge)
    if (dto.clientProfile && user.role === UserRole.CLIENT) {
      user.clientProfile = this.mergeClientProfile(
        user.clientProfile || ({} as ClientProfile),
        dto.clientProfile
      );
    }

    await user.save();
    return this.transformUserResponse(user);
  }

  /**
   * Deep merge artist profile - maps API response format to model format
   */
  private mergeArtistProfile(existing: ArtistProfile, updates: Partial<ArtistProfileResponse & { onboardingComplete?: boolean }>): ArtistProfile {
    const merged: ArtistProfile = { ...existing };

    // Map API fields to model fields
    if (updates.stageName !== undefined) merged.stageName = updates.stageName;
    if (updates.bio !== undefined) merged.bio = updates.bio;
    if (updates.genres !== undefined) merged.genres = updates.genres as ArtistProfile['genres'];
    if (updates.performanceTypes !== undefined) {
      merged.performanceTypes = updates.performanceTypes as ArtistProfile['performanceTypes'];
    }
    if (updates.instruments !== undefined) merged.instruments = updates.instruments as ArtistProfile['instruments'];
    if (updates.languages !== undefined) merged.languages = updates.languages as ArtistProfile['languages'];
    // Handle both old field names (experienceYears, hourlyRate) and new ones (yearsOfExperience, baseRate)
    if (updates.yearsOfExperience !== undefined) merged.yearsOfExperience = updates.yearsOfExperience;
    else if (updates.experienceYears !== undefined) merged.yearsOfExperience = updates.experienceYears;
    if (updates.baseRate !== undefined) merged.baseRate = updates.baseRate;
    else if (updates.hourlyRate !== undefined) merged.baseRate = updates.hourlyRate;
    if (updates.onboardingComplete !== undefined) merged.onboardingComplete = updates.onboardingComplete;

    // Map location
    if (updates.location) {
      merged.location = {
        ...existing.location,
        city: updates.location.city ?? existing.location?.city,
        state: updates.location.state ?? existing.location?.state,
        country: updates.location.country ?? existing.location?.country,
        geoPoint: updates.location.coordinates ? {
          type: 'Point',
          coordinates: [updates.location.coordinates.lng, updates.location.coordinates.lat]
        } : existing.location?.geoPoint,
      };
    }

    // Map portfolio to individual fields
    if (updates.portfolio) {
      if (updates.portfolio.videos) merged.videoLinks = updates.portfolio.videos;
      if (updates.portfolio.images) merged.portfolioImages = updates.portfolio.images;
      if (updates.portfolio.audio) {
        merged.audioSamples = updates.portfolio.audio.map(url => ({ url }));
      }
    }

    // Map social links to individual fields
    if (updates.socialLinks) {
      if (updates.socialLinks.instagram !== undefined) merged.instagramHandle = updates.socialLinks.instagram;
      if (updates.socialLinks.youtube !== undefined) merged.youtubeChannel = updates.socialLinks.youtube;
    }

    return merged;
  }

  /**
   * Deep merge client profile - maps API response format to model format
   */
  private mergeClientProfile(existing: ClientProfile, updates: Partial<{ companyName?: string; location?: { city?: string; state?: string; country?: string }; totalGigsPosted?: number }>): ClientProfile {
    const merged: ClientProfile = { ...existing };

    if (updates.companyName !== undefined) merged.company = updates.companyName;

    if (updates.location) {
      merged.location = {
        ...existing.location,
        city: updates.location.city ?? existing.location?.city,
        state: updates.location.state ?? existing.location?.state,
        country: updates.location.country ?? existing.location?.country,
      };
    }

    return merged;
  }

  /**
   * Search Artists
   */
  async searchArtists(params: {
    query?: string;
    genre?: string;
    performanceType?: string;
    city?: string;
    lat?: number;
    lng?: number;
    distance?: number;
    page: number;
    limit: number;
  }): Promise<{ data: UserProfileResponse[]; meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean } }> {
    const filter: Record<string, unknown> = {
      role: UserRole.ARTIST,
      status: UserStatus.ACTIVE,
    };

    // Build $and array for combining conditions
    const andConditions: Record<string, unknown>[] = [
      // Artist is searchable if they've completed onboarding OR have a stageName set
      {
        $or: [
          { 'artistProfile.onboardingComplete': true },
          { 'artistProfile.stageName': { $exists: true, $ne: '' } },
        ],
      },
    ];

    // Text Search — SECURITY (M5): require minLength, escape regex specials.
    if (params.query) {
      const trimmed = params.query.trim();
      if (trimmed.length < 2) {
        throw new BadRequestException('Search query must be at least 2 characters');
      }
      const safe = escapeRegex(trimmed);
      andConditions.push({
        $or: [
          { name: { $regex: safe, $options: 'i' } },
          { 'artistProfile.stageName': { $regex: safe, $options: 'i' } },
          { 'artistProfile.bio': { $regex: safe, $options: 'i' } },
        ],
      });
    }

    // Add $and to filter if we have conditions
    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    // Filters - use $in for array field matching
    if (params.genre) {
      filter['artistProfile.genres'] = { $in: [params.genre] };
    }
    if (params.performanceType) {
      filter['artistProfile.performanceTypes'] = { $in: [params.performanceType] };
    }
    if (params.city) {
      filter['artistProfile.location.city'] = {
        $regex: escapeRegex(params.city),
        $options: 'i',
      };
    }

    // Geospatial Search
    if (params.lat && params.lng) {
      filter['artistProfile.location.geoPoint'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [params.lng, params.lat],
          },
          $maxDistance: params.distance || 50000, // Default 50km
        },
      };
    }

    const skip = (params.page - 1) * params.limit;

    // SECURITY (H9): explicit allow-list. Never expose email/phone/firebaseUid
    // / refreshToken / password / lastLogin in a PUBLIC artist directory.
    const [artists, total] = await Promise.all([
      UserModel.find(filter)
        .select(
          '_id name profilePicture role isVerified artistProfile createdAt'
        )
        .skip(skip)
        .limit(params.limit)
        .lean()
        .exec(),
      UserModel.countDocuments(filter).exec(),
    ]);

    const totalPages = Math.ceil(total / params.limit);

    return {
      data: artists.map(artist => this.transformUserResponse(artist)),
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
   * Upload profile picture.
   *
   * SECURITY (H10):
   * - Magic-byte MIME detection (don't trust the client-supplied Content-Type
   *   or file name).
   * - 5MB cap.
   * - Sanitized S3 key — never include the user-supplied filename verbatim;
   *   use `{userId}/profile/{uuid}.{ext}`.
   */
  async uploadProfilePicture(userId: string, file: File): Promise<string> {
    const MAX_BYTES = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('Profile picture must be 5MB or smaller');
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const detected = detectImageMime(buffer);
    if (!detected) {
      throw new BadRequestException(
        'Profile picture must be a JPEG, PNG, GIF, or WebP image'
      );
    }

    const key = `users/${userId}/profile/${randomUUID()}.${detected.ext}`;
    const url = await s3Service.uploadFile(buffer, key, detected.mime);

    await UserModel.findByIdAndUpdate(userId, { profilePicture: url });
    return url;
  }

  /**
   * Transform User document to full response format
   * Maps model field names to API response field names
   */
  private transformUserResponse(user: User): UserProfileResponse {
    const response: UserProfileResponse = {
      id: user._id.toString(),
      firebaseUid: user.firebaseUid,
      email: user.email,
      phoneNumber: user.phoneNumber,
      name: user.name,
      profilePicture: user.profilePicture,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt ?? new Date(),
      updatedAt: user.updatedAt ?? new Date(),
    };

    if (user.artistProfile && user.role === UserRole.ARTIST) {
      response.artistProfile = {
        bio: user.artistProfile.bio,
        genres: (user.artistProfile.genres || []) as string[],
        performanceTypes: (user.artistProfile.performanceTypes || []) as string[],
        experienceYears: user.artistProfile.yearsOfExperience,
        hourlyRate: user.artistProfile.baseRate,
        location: user.artistProfile.location ? {
          city: user.artistProfile.location.city,
          state: user.artistProfile.location.state,
          country: user.artistProfile.location.country,
          coordinates: user.artistProfile.location.geoPoint ? {
            lng: user.artistProfile.location.geoPoint.coordinates[0],
            lat: user.artistProfile.location.geoPoint.coordinates[1],
          } : undefined,
        } : undefined,
        portfolio: {
          videos: user.artistProfile.videoLinks || [],
          images: user.artistProfile.portfolioImages || [],
          audio: (user.artistProfile.audioSamples || []).map(s => s.url),
        },
        socialLinks: {
          instagram: user.artistProfile.instagramHandle,
          youtube: user.artistProfile.youtubeChannel,
        },
        isVerified: user.isVerified || false,
        rating: undefined, // Not stored in model yet
        totalGigs: undefined, // Would need to be computed from gigs collection
      };
    }

    if (user.clientProfile && user.role === UserRole.CLIENT) {
      response.clientProfile = {
        companyName: user.clientProfile.company,
        location: user.clientProfile.location ? {
          city: user.clientProfile.location.city,
          state: user.clientProfile.location.state,
          country: user.clientProfile.location.country,
        } : undefined,
        totalGigsPosted: undefined, // Would need to be computed from gigs collection
      };
    }

    return response;
  }

  /**
   * Transform User document to public profile (limited info)
   */
  private transformPublicProfile(user: User): PublicUserProfile {
    const response: PublicUserProfile = {
      id: user._id.toString(),
      name: user.name,
      role: user.role,
      profilePicture: user.profilePicture,
      isVerified: user.isVerified || false,
    };

    if (user.artistProfile && user.role === UserRole.ARTIST) {
      response.artistProfile = {
        stageName: user.artistProfile.stageName,
        bio: user.artistProfile.bio,
        genres: (user.artistProfile.genres || []) as string[],
        performanceTypes: (user.artistProfile.performanceTypes || []) as string[],
        instruments: (user.artistProfile.instruments || []) as string[],
        languages: (user.artistProfile.languages || []) as string[],
        yearsOfExperience: user.artistProfile.yearsOfExperience,
        experienceYears: user.artistProfile.yearsOfExperience,
        baseRate: user.artistProfile.baseRate,
        hourlyRate: user.artistProfile.baseRate,
        location: user.artistProfile.location ? {
          city: user.artistProfile.location.city,
          state: user.artistProfile.location.state,
          country: user.artistProfile.location.country,
        } : undefined,
        isVerified: user.isVerified || false,
        rating: undefined,
        portfolio: {
          videos: user.artistProfile.videoLinks || [],
          images: user.artistProfile.portfolioImages || [],
          audio: (user.artistProfile.audioSamples || []).map(s => s.url),
        },
        videoLinks: user.artistProfile.videoLinks || [],
        audioSamples: (user.artistProfile.audioSamples || []).map(s => s.url),
        instagramHandle: user.artistProfile.instagramHandle,
        socialLinks: {
          instagram: user.artistProfile.instagramHandle,
          youtube: user.artistProfile.youtubeChannel,
        },
      };
    }

    if (user.clientProfile && user.role === UserRole.CLIENT) {
      response.clientProfile = {
        companyName: user.clientProfile.company,
        totalGigsPosted: undefined,
      };
    }

    return response;
  }
}
