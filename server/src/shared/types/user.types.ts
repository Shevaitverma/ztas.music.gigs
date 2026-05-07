import { UserRole, UserStatus } from '../enums';

/**
 * Artist Profile Response
 */
export interface ArtistProfileResponse {
  stageName?: string;
  bio?: string;
  genres: string[];
  performanceTypes: string[];
  instruments?: string[];
  languages?: string[];
  experienceYears?: number;
  hourlyRate?: number;
  // Alternative field names (from frontend)
  yearsOfExperience?: number;
  baseRate?: number;
  location?: {
    city?: string;
    state?: string;
    country?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  portfolio?: {
    videos: string[];
    images: string[];
    audio: string[];
  };
  socialLinks?: {
    instagram?: string;
    youtube?: string;
    spotify?: string;
    soundcloud?: string;
  };
  isVerified: boolean;
  rating?: number;
  totalGigs?: number;
}

/**
 * Client Profile Response
 */
export interface ClientProfileResponse {
  companyName?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  totalGigsPosted?: number;
}

/**
 * User Profile Response
 */
export interface UserProfileResponse {
  id: string;
  firebaseUid: string;
  email?: string;
  phoneNumber?: string;
  name?: string;
  role: UserRole;
  profilePicture?: string;
  status: UserStatus;
  artistProfile?: ArtistProfileResponse;
  clientProfile?: ClientProfileResponse;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Public User Profile (limited info).
 *
 * SECURITY (H9): never expose email/phone/firebaseUid/lastLogin/refreshToken
 * in this shape. The service-layer query selects only the safe allow-list.
 */
export interface PublicUserProfile {
  id: string;
  name?: string;
  role: UserRole;
  profilePicture?: string;
  isVerified?: boolean;
  artistProfile?: Partial<ArtistProfileResponse> & {
    videoLinks?: string[];
    audioSamples?: string[];
    instagramHandle?: string;
  };
  clientProfile?: Partial<ClientProfileResponse>;
}

/**
 * Update Profile DTO.
 *
 * SECURITY (M8): email/phoneNumber are NOT in this DTO. They are tied to
 * Firebase auth and can only be changed via the verified-OTP / verified-email
 * flow.
 */
export interface UpdateProfileDto {
  name?: string;
  profilePicture?: string;
  artistProfile?: Partial<ArtistProfileResponse>;
  clientProfile?: Partial<ClientProfileResponse>;
}

/**
 * Search Artists Query Parameters
 */
export interface SearchArtistsQuery {
  query?: string;
  genre?: string;
  performanceType?: string;
  city?: string;
  lat?: number;
  lng?: number;
  distance?: number;
  page: number;
  limit: number;
}

/**
 * Paginated Response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

