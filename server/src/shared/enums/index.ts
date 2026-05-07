export enum UserRole {
  ARTIST = 'artist',
  CLIENT = 'client',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BANNED = 'banned',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export enum AuthProvider {
  GOOGLE = 'google',
  PHONE = 'phone',
  EMAIL = 'email',
}

export enum GigStatus {
  DRAFT = 'DRAFT',
  LIVE = 'LIVE',
  BOOKED = 'BOOKED',
  CLOSED = 'CLOSED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Check-in Status Enum - Event check-in workflow status
 */
export enum CheckInStatus {
  /** OTP generated, waiting for artist to check in */
  PENDING = 'PENDING',
  /** Artist entered OTP successfully */
  CHECKED_IN = 'CHECKED_IN',
  /** Event has started */
  EVENT_STARTED = 'EVENT_STARTED',
  /** Both parties confirmed event end */
  EVENT_ENDED = 'EVENT_ENDED',
  /** OTP expired, artist didn't show */
  EXPIRED = 'EXPIRED',
  /** Event was cancelled */
  CANCELLED = 'CANCELLED',
}

export enum GigCategory {
  SOLO_VOCALIST = 'SOLO_VOCALIST',
  LIVE_BAND = 'LIVE_BAND',
  DJ = 'DJ',
  ACOUSTIC = 'ACOUSTIC',
  CLASSICAL = 'CLASSICAL',
  JAZZ = 'JAZZ',
  ELECTRONIC = 'ELECTRONIC',
  TRADITIONAL = 'TRADITIONAL',
  COVER_BAND = 'COVER_BAND',
  ORIGINAL_ARTIST = 'ORIGINAL_ARTIST',
  // Legacy values for backwards compatibility
  SOLO_SINGER = 'SOLO_SINGER',
  INSTRUMENTALIST = 'INSTRUMENTALIST',
  OTHER = 'OTHER',
}

export enum ApplicationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
  /** Application was cancelled because the gig was cancelled or closed */
  CANCELLED = 'CANCELLED',
}

export enum BidStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
  /** Bid was cancelled because the gig was cancelled or closed */
  CANCELLED = 'CANCELLED',
}

export enum VenueType {
  RESTAURANT = 'RESTAURANT',
  BAR = 'BAR',
  ROOFTOP = 'ROOFTOP',
  CAFE = 'CAFE',
  CLUB = 'CLUB',
  HOTEL = 'HOTEL',
  OTHER = 'OTHER',
}

/**
 * Performance Type Enum - Type of artist performance
 */
export enum PerformanceType {
  SOLO_SINGER = 'SOLO_SINGER',
  BAND = 'BAND',
  DJ = 'DJ',
  INSTRUMENTALIST = 'INSTRUMENTALIST',
  ACOUSTIC = 'ACOUSTIC',
  CLASSICAL = 'CLASSICAL',
  DUO = 'DUO',
  OTHER = 'OTHER',
}

/**
 * Music Genre Enum - Genres artist can perform
 */
export enum MusicGenre {
  BOLLYWOOD = 'BOLLYWOOD',
  POP = 'POP',
  ROCK = 'ROCK',
  CLASSICAL = 'CLASSICAL',
  SUFI = 'SUFI',
  FOLK = 'FOLK',
  JAZZ = 'JAZZ',
  BLUES = 'BLUES',
  HIP_HOP = 'HIP_HOP',
  EDM = 'EDM',
  RETRO = 'RETRO',
  GHAZAL = 'GHAZAL',
  PUNJABI = 'PUNJABI',
  INDIE = 'INDIE',
  FUSION = 'FUSION',
  OTHER = 'OTHER',
}

/**
 * Instrument Enum - Instruments artist can play
 */
export enum Instrument {
  GUITAR = 'GUITAR',
  KEYBOARD = 'KEYBOARD',
  PIANO = 'PIANO',
  DRUMS = 'DRUMS',
  VIOLIN = 'VIOLIN',
  FLUTE = 'FLUTE',
  TABLA = 'TABLA',
  HARMONIUM = 'HARMONIUM',
  SITAR = 'SITAR',
  SAXOPHONE = 'SAXOPHONE',
  BASS = 'BASS',
  UKULELE = 'UKULELE',
  CAJON = 'CAJON',
  OTHER = 'OTHER',
}

/**
 * Language Enum - Languages artist can perform in
 */
export enum PerformanceLanguage {
  HINDI = 'HINDI',
  ENGLISH = 'ENGLISH',
  PUNJABI = 'PUNJABI',
  TAMIL = 'TAMIL',
  TELUGU = 'TELUGU',
  KANNADA = 'KANNADA',
  MARATHI = 'MARATHI',
  BENGALI = 'BENGALI',
  GUJARATI = 'GUJARATI',
  URDU = 'URDU',
  OTHER = 'OTHER',
}

/**
 * Review Type Enum - Who is reviewing whom
 */
export enum ReviewType {
  /** Client reviewing an Artist after gig completion */
  CLIENT_TO_ARTIST = 'CLIENT_TO_ARTIST',
  /** Artist reviewing a Client after gig completion */
  ARTIST_TO_CLIENT = 'ARTIST_TO_CLIENT',
}

/**
 * Review Status Enum - Moderation status of reviews
 */
export enum ReviewStatus {
  /** Review is pending moderation */
  PENDING = 'PENDING',
  /** Review is published and visible */
  PUBLISHED = 'PUBLISHED',
  /** Review is hidden due to violation */
  HIDDEN = 'HIDDEN',
  /** Review was removed by admin */
  REMOVED = 'REMOVED',
}

/**
 * Report Category Enum - Category of the issue being reported
 */
export enum ReportCategory {
  /** Issues related to user behavior */
  USER_BEHAVIOR = 'USER_BEHAVIOR',
  /** Issues related to gig content */
  GIG_CONTENT = 'GIG_CONTENT',
  /** Issues related to payment/transactions */
  PAYMENT = 'PAYMENT',
  /** Issues related to profile content */
  PROFILE_CONTENT = 'PROFILE_CONTENT',
  /** Safety and security concerns */
  SAFETY = 'SAFETY',
  /** Spam or promotional content */
  SPAM = 'SPAM',
  /** Technical issues */
  TECHNICAL = 'TECHNICAL',
  /** Other issues */
  OTHER = 'OTHER',
}

/**
 * Report Type Enum - Specific type/severity of the issue
 */
export enum ReportType {
  /** User harassment or bullying */
  HARASSMENT = 'HARASSMENT',
  /** Fraudulent activity */
  FRAUD = 'FRAUD',
  /** Scam attempt */
  SCAM = 'SCAM',
  /** User impersonation */
  IMPERSONATION = 'IMPERSONATION',
  /** Inappropriate or offensive content */
  INAPPROPRIATE_CONTENT = 'INAPPROPRIATE_CONTENT',
  /** Illegal content */
  ILLEGAL_CONTENT = 'ILLEGAL_CONTENT',
  /** Artist or client no-show at gig */
  NO_SHOW = 'NO_SHOW',
  /** Late arrival or poor time management */
  LATE_ARRIVAL = 'LATE_ARRIVAL',
  /** Unprofessional behavior during gig */
  UNPROFESSIONAL_BEHAVIOR = 'UNPROFESSIONAL_BEHAVIOR',
  /** Quality not as described/promised */
  QUALITY_MISMATCH = 'QUALITY_MISMATCH',
  /** False or misleading information */
  FALSE_INFORMATION = 'FALSE_INFORMATION',
  /** Payment dispute */
  PAYMENT_DISPUTE = 'PAYMENT_DISPUTE',
  /** Safety concern at venue/event */
  SAFETY_CONCERN = 'SAFETY_CONCERN',
  /** Copyright or IP infringement */
  COPYRIGHT = 'COPYRIGHT',
  /** Spam messages or promotions */
  SPAM = 'SPAM',
  /** Bug or technical issue report */
  BUG = 'BUG',
  /** Other issue not covered */
  OTHER = 'OTHER',
}

/**
 * Report Status Enum - Status of the report in the review workflow
 */
export enum ReportStatus {
  /** Report submitted, awaiting review */
  PENDING = 'PENDING',
  /** Report is being reviewed by admin */
  UNDER_REVIEW = 'UNDER_REVIEW',
  /** More information needed from reporter */
  NEEDS_INFO = 'NEEDS_INFO',
  /** Report is being investigated */
  INVESTIGATING = 'INVESTIGATING',
  /** Action has been taken */
  RESOLVED = 'RESOLVED',
  /** Report dismissed (no action needed) */
  DISMISSED = 'DISMISSED',
  /** Report escalated to higher authority */
  ESCALATED = 'ESCALATED',
}

// ==========================================
// VERIFICATION SYSTEM ENUMS
// ==========================================

/**
 * Verification Status Enum - Status of verification documents/sections
 */
export enum VerificationStatus {
  /** Document not yet submitted */
  NOT_SUBMITTED = 'NOT_SUBMITTED',
  /** Document submitted, awaiting review */
  PENDING = 'PENDING',
  /** Document is being reviewed by admin */
  UNDER_REVIEW = 'UNDER_REVIEW',
  /** Verification approved */
  VERIFIED = 'VERIFIED',
  /** Verification rejected */
  REJECTED = 'REJECTED',
  /** Verification expired (re-verification needed) */
  EXPIRED = 'EXPIRED',
}

/**
 * Identity Document Type Enum - Types of identity documents for KYC
 */
export enum IdentityDocType {
  /** Aadhaar Card (India) */
  AADHAAR = 'AADHAAR',
  /** PAN Card (India) */
  PAN = 'PAN',
  /** Passport */
  PASSPORT = 'PASSPORT',
  /** Driving License */
  DRIVING_LICENSE = 'DRIVING_LICENSE',
}

/**
 * Business Type Enum - Type of business entity for organizers
 */
export enum BusinessType {
  /** Individual proprietor */
  INDIVIDUAL = 'INDIVIDUAL',
  /** Private Limited Company */
  COMPANY = 'COMPANY',
  /** Partnership firm */
  PARTNERSHIP = 'PARTNERSHIP',
  /** Limited Liability Partnership */
  LLP = 'LLP',
}

/**
 * Venue Proof Type Enum - How the organizer proves venue ownership/authorization
 */
export enum VenueProofType {
  /** Owns the venue */
  OWNERSHIP = 'OWNERSHIP',
  /** Leases/rents the venue */
  LEASE = 'LEASE',
  /** Has authorization letter to host events */
  AUTHORIZATION = 'AUTHORIZATION',
}

// ==========================================
// ACTIVITY LOGGING ENUMS
// ==========================================

/**
 * Activity Action Enum - All trackable actions in the system
 */
export enum ActivityAction {
  // Auth actions
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  LOGIN_FAILED = 'LOGIN_FAILED',
  TOKEN_REFRESH = 'TOKEN_REFRESH',

  // Profile actions
  PROFILE_UPDATED = 'PROFILE_UPDATED',
  PROFILE_PICTURE_CHANGED = 'PROFILE_PICTURE_CHANGED',

  // Gig actions
  GIG_CREATED = 'GIG_CREATED',
  GIG_UPDATED = 'GIG_UPDATED',
  GIG_PUBLISHED = 'GIG_PUBLISHED',
  GIG_CLOSED = 'GIG_CLOSED',
  GIG_CANCELLED = 'GIG_CANCELLED',
  GIG_COMPLETED = 'GIG_COMPLETED',

  // Bid actions
  BID_PLACED = 'BID_PLACED',
  BID_ACCEPTED = 'BID_ACCEPTED',
  BID_REJECTED = 'BID_REJECTED',

  // Application actions
  APPLICATION_SUBMITTED = 'APPLICATION_SUBMITTED',
  APPLICATION_ACCEPTED = 'APPLICATION_ACCEPTED',
  APPLICATION_REJECTED = 'APPLICATION_REJECTED',
  APPLICATION_WITHDRAWN = 'APPLICATION_WITHDRAWN',

  // Check-in actions
  OTP_GENERATED = 'OTP_GENERATED',
  OTP_VERIFIED = 'OTP_VERIFIED',
  EVENT_STARTED = 'EVENT_STARTED',
  EVENT_ENDED = 'EVENT_ENDED',

  // Review actions
  REVIEW_SUBMITTED = 'REVIEW_SUBMITTED',
  REVIEW_UPDATED = 'REVIEW_UPDATED',
  REVIEW_DELETED = 'REVIEW_DELETED',
  REVIEW_FLAGGED = 'REVIEW_FLAGGED',

  // Report actions
  REPORT_SUBMITTED = 'REPORT_SUBMITTED',
  REPORT_RESOLVED = 'REPORT_RESOLVED',

  // Verification actions
  VERIFICATION_SUBMITTED = 'VERIFICATION_SUBMITTED',
  VERIFICATION_APPROVED = 'VERIFICATION_APPROVED',
  VERIFICATION_REJECTED = 'VERIFICATION_REJECTED',

  // Admin actions
  USER_BANNED = 'USER_BANNED',
  USER_SUSPENDED = 'USER_SUSPENDED',
  USER_UNBANNED = 'USER_UNBANNED',
  USER_VERIFIED = 'USER_VERIFIED',
  CONTENT_REMOVED = 'CONTENT_REMOVED',
}

/**
 * Activity Category Enum - Groups of related actions
 */
export enum ActivityCategory {
  AUTH = 'AUTH',
  PROFILE = 'PROFILE',
  GIG = 'GIG',
  BID = 'BID',
  APPLICATION = 'APPLICATION',
  CHECK_IN = 'CHECK_IN',
  REVIEW = 'REVIEW',
  REPORT = 'REPORT',
  VERIFICATION = 'VERIFICATION',
  ADMIN = 'ADMIN',
}

/**
 * Target Type Enum - Types of entities that can be targeted by actions
 */
export enum TargetType {
  USER = 'USER',
  GIG = 'GIG',
  BID = 'BID',
  APPLICATION = 'APPLICATION',
  REVIEW = 'REVIEW',
  REPORT = 'REPORT',
  VERIFICATION = 'VERIFICATION',
  CHECK_IN = 'CHECK_IN',
}

// ==========================================
// ADMIN SYSTEM ENUMS
// ==========================================

/**
 * Admin Permission Enum - Granular permissions for admin actions
 */
export enum AdminPermission {
  /** View user list and details */
  VIEW_USERS = 'VIEW_USERS',
  /** Edit user profiles */
  EDIT_USERS = 'EDIT_USERS',
  /** Ban or suspend users */
  BAN_USERS = 'BAN_USERS',
  /** View verification requests */
  VIEW_VERIFICATIONS = 'VIEW_VERIFICATIONS',
  /** Approve or reject verifications */
  APPROVE_VERIFICATIONS = 'APPROVE_VERIFICATIONS',
  /** View reports */
  VIEW_REPORTS = 'VIEW_REPORTS',
  /** Resolve reports */
  RESOLVE_REPORTS = 'RESOLVE_REPORTS',
  /** Moderate reviews (hide, remove) */
  MODERATE_REVIEWS = 'MODERATE_REVIEWS',
  /** View analytics dashboard */
  VIEW_ANALYTICS = 'VIEW_ANALYTICS',
  /** Export data (CSV, JSON) */
  EXPORT_DATA = 'EXPORT_DATA',
  /** View activity logs */
  VIEW_ACTIVITY_LOGS = 'VIEW_ACTIVITY_LOGS',
  /** View storage statistics */
  VIEW_STORAGE = 'VIEW_STORAGE',
  /** Manage storage (cleanup orphaned files) */
  MANAGE_STORAGE = 'MANAGE_STORAGE',
  /** Manage other admins */
  MANAGE_ADMINS = 'MANAGE_ADMINS',
  /** Modify system settings */
  SYSTEM_SETTINGS = 'SYSTEM_SETTINGS',
}

/**
 * Admin Role Enum - Predefined admin role types with permission sets
 */
export enum AdminRole {
  /** Full access to all features */
  SUPER_ADMIN = 'SUPER_ADMIN',
  /** Content moderation and user management */
  MODERATOR = 'MODERATOR',
  /** Verification approvals */
  VERIFIER = 'VERIFIER',
  /** Analytics and reporting */
  ANALYST = 'ANALYST',
}
