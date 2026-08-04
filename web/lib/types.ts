// User Types
// NOTE: Backend expects lowercase values for role enum
export type UserRole = 'artist' | 'client' | 'admin'

export interface ClientProfile {
  companyName?: string
  location?: {
    city?: string
    state?: string
    country?: string
  }
  totalGigsPosted?: number
}

export interface User {
  id: string
  firebaseUid: string
  email?: string
  phone?: string
  phoneNumber?: string
  name: string
  role: UserRole
  profilePicture?: string
  isVerified: boolean
  createdAt: string
  updatedAt: string
  artistProfile?: ArtistProfile
  clientProfile?: ClientProfile
}

export interface ArtistProfile {
  stageName: string
  bio?: string
  performanceTypes: string[]
  genres: string[]
  instruments: string[]
  languages: string[]
  yearsOfExperience: number
  baseRate: number
  location: {
    city: string
    geoPoint?: {
      type: 'Point'
      coordinates: [number, number]
    }
  }
  videoLinks?: string[]
  audioSamples?: string[]
  instagramHandle?: string
  onboardingComplete: boolean
}

// Gig Types
export type GigStatus = 'DRAFT' | 'LIVE' | 'BOOKED' | 'CLOSED' | 'COMPLETED' | 'CANCELLED'

export type GigCategory =
  | 'SOLO_VOCALIST'
  | 'LIVE_BAND'
  | 'DJ'
  | 'ACOUSTIC'
  | 'CLASSICAL'
  | 'JAZZ'
  | 'ELECTRONIC'
  | 'TRADITIONAL'
  | 'COVER_BAND'
  | 'ORIGINAL_ARTIST'

export interface Gig {
  id: string
  /**
   * The organizer. NOTE: `GET /gigs/:id` returns this as `postedBy` with only
   * `{ id, name, profilePicture }` populated — there is no `client`/`clientId`
   * field and no email/phone on the wire.
   */
  postedBy?: {
    id: string
    name?: string
    profilePicture?: string
  }
  title: string
  description: string
  category: GigCategory
  budget: {
    min: number
    max: number
    currency: string
  }
  venue: {
    name: string
    address: string
    city: string
    coordinates?: {
      lat: number
      lng: number
    }
  }
  eventTiming: {
    date: string
    startTime: string
    endTime: string
  }
  requirements?: string
  status: GigStatus
  /**
   * NOT returned by `GET /gigs/:id` (see transformGigResponse on the server).
   * Determine the booked artist from the ACCEPTED bid instead.
   */
  acceptedBid?: string
  acceptedArtist?: string
  bidsCount?: number
  applicationCount?: number
  createdAt: string
  updatedAt: string
}

// Flattened gig type returned by list endpoints (search, my gigs, etc.)
export interface GigListItem {
  id: string
  title: string
  description?: string
  category: GigCategory
  budget: {
    min: number
    max: number
    currency: string
  }
  city: string
  venueName: string
  eventDate: string
  startTime: string
  durationMinutes: number
  status: GigStatus
  applicationCount: number
  bidsCount?: number
  createdAt: string
}

// Bid Types
export type BidStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN'

/**
 * The artist stub the server attaches to a bid. NOT a `User`: the bid transform
 * (server/src/modules/bids/bids.service.ts) renames `profilePicture` to
 * `profileImage` and sends only these four artistProfile fields. Typing this as
 * `User` is what let `bid.artist.profilePicture` (always undefined) typecheck.
 */
export interface BidArtist {
  id: string
  name?: string
  profileImage?: string
  artistProfile?: Partial<ArtistProfile>
}

export interface Bid {
  id: string
  gigId: string
  gig?: Gig
  artistId: string
  artist?: BidArtist
  amount: number
  proposal: string
  status: BidStatus
  createdAt: string
  updatedAt: string
}

// Check-in Types
// Mirrors server CheckInResponse (server/src/modules/checkin/checkin.schemas.ts).
export type CheckInStatus =
  | 'PENDING'
  | 'CHECKED_IN'
  | 'EVENT_STARTED'
  | 'EVENT_ENDED'
  | 'EXPIRED'
  | 'CANCELLED'

export interface CheckIn {
  id: string
  gigId: string
  bidId: string
  artistId: string
  organizerId: string
  status: CheckInStatus
  /** Organizer-only fields — omitted in artist-facing responses. */
  otp?: string
  otpExpiresAt?: string
  otpRegenerateCount?: number
  artistCheckedInAt?: string
  eventStartedAt?: string
  eventEndedAt?: string
  endConfirmation?: {
    organizerConfirmed: boolean
    artistConfirmed: boolean
  }
  artistLocation?: {
    lat: number
    lng: number
    capturedAt: string
  }
  createdAt: string
  updatedAt: string
}

/** GET /checkin/otp/:gigId (organizer only) */
export interface OtpInfo {
  otp: string
  expiresAt: string
  regenerateCount: number
  maxRegenerations: number
}

// Review Types
export type ReviewType = 'CLIENT_TO_ARTIST' | 'ARTIST_TO_CLIENT'

export interface ReviewParty {
  id: string
  name?: string
  profilePicture?: string
}

export interface Review {
  id: string
  gigId: string
  reviewer: ReviewParty
  reviewee: ReviewParty
  type: ReviewType
  rating: number
  ratings?: {
    professionalism?: number
    quality?: number
    value?: number
    communication?: number
  }
  title?: string
  comment: string
  wouldRecommend: boolean
  response?: {
    comment: string
    createdAt: string
  }
  status: string
  createdAt: string
  updatedAt: string
}

export interface ReviewStats {
  averageRating: number
  totalReviews: number
  /** Counts of reviews per star value, keyed '1'..'5'. */
  ratingBreakdown?: Record<string, number>
  recommendationRate: number
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  timestamp?: string
}

// Pagination metadata from backend
export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

// Backend paginated response structure (nested data)
export interface PaginatedData<T> {
  data: T[]
  meta: PaginationMeta
}

// Backend error response formats (supports multiple formats)
export interface ApiError {
  success: false
  message?: string
  error?: string | {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

// Auth Types
export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

// Backend returns tokens at top level, not nested
export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: User
}

// Filter Types
export interface GigFilters {
  city?: string
  category?: GigCategory
  status?: GigStatus
  minBudget?: number
  maxBudget?: number
  date?: string
  lat?: number
  lng?: number
  distance?: number
  page?: number
  limit?: number
  excludeGigs?: string
  sortBy?: 'date' | 'budget' | 'city' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

export interface BidFilters {
  status?: BidStatus
  page?: number
  limit?: number
}

// Form Types
export interface CreateGigInput {
  title: string
  description: string
  category: GigCategory
  budget: {
    min: number
    max: number
    currency: string
  }
  venue: {
    name: string
    address: string
    city: string
    coordinates?: {
      lat: number
      lng: number
    }
  }
  eventTiming: {
    date: string
    startTime: string
    endTime: string
  }
  requirements?: string
}

export interface CreateBidInput {
  gigId: string
  amount: number
  proposal: string
}

export interface UpdateBidInput {
  amount?: number
  proposal?: string
}

export interface UpdateGigInput extends Partial<CreateGigInput> {
  id?: string
}

export interface UpdateArtistProfileInput {
  stageName: string
  bio?: string
  performanceTypes: string[]
  genres: string[]
  instruments: string[]
  languages: string[]
  yearsOfExperience: number
  baseRate: number
  location: {
    city: string
    geoPoint?: {
      type: 'Point'
      coordinates: [number, number]
    }
  }
  videoLinks?: string[]
  audioSamples?: string[]
  instagramHandle?: string
  onboardingComplete?: boolean
}

export interface CreateReviewInput {
  gigId: string
  rating: number
  ratings?: {
    professionalism?: number
    quality?: number
    value?: number
    communication?: number
  }
  title?: string
  /** 20–2000 chars, enforced server-side. */
  comment: string
  wouldRecommend?: boolean
}
