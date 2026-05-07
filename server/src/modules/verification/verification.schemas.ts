import { t } from 'elysia';
import { IdentityDocType, BusinessType, VenueProofType, VerificationStatus } from '../../shared/enums';

// ===================================
// ORGANIZER VERIFICATION SCHEMAS
// ===================================

/**
 * Submit Identity Verification Schema (Organizer)
 */
export const SubmitOrganizerIdentitySchema = t.Object({
  type: t.Enum(IdentityDocType, { description: 'Type of identity document' }),
  number: t.String({ minLength: 6, maxLength: 20, description: 'Document number' }),
  documentUrl: t.String({ description: 'URL of the uploaded document' }),
  selfieUrl: t.String({ description: 'URL of the selfie with document' }),
});

export type SubmitOrganizerIdentityDto = typeof SubmitOrganizerIdentitySchema.static;

/**
 * Submit Business Verification Schema (Organizer)
 */
export const SubmitBusinessSchema = t.Object({
  type: t.Enum(BusinessType, { description: 'Type of business entity' }),
  name: t.String({ minLength: 2, maxLength: 200, description: 'Business name' }),
  panNumber: t.String({ minLength: 10, maxLength: 10, description: 'PAN number' }),
  gstNumber: t.Optional(t.String({ description: 'GST number (optional)' })),
  registrationDocUrl: t.Optional(t.String({ description: 'Registration document URL' })),
});

export type SubmitBusinessDto = typeof SubmitBusinessSchema.static;

/**
 * Submit Venue Verification Schema (Organizer)
 */
export const SubmitVenueSchema = t.Object({
  name: t.String({ minLength: 2, maxLength: 200, description: 'Venue name' }),
  address: t.String({ minLength: 10, maxLength: 500, description: 'Full address' }),
  city: t.String({ minLength: 2, maxLength: 100, description: 'City' }),
  proofType: t.Enum(VenueProofType, { description: 'Type of venue proof' }),
  proofDocUrl: t.String({ description: 'URL of the proof document' }),
  photosUrls: t.Optional(t.Array(t.String(), { description: 'URLs of venue photos' })),
  coordinates: t.Object({
    lat: t.Number({ description: 'Latitude' }),
    lng: t.Number({ description: 'Longitude' }),
  }),
});

export type SubmitVenueDto = typeof SubmitVenueSchema.static;

// ===================================
// ARTIST VERIFICATION SCHEMAS
// ===================================

/**
 * Submit Identity Verification Schema (Artist)
 */
export const SubmitArtistIdentitySchema = t.Object({
  type: t.Enum(IdentityDocType, { description: 'Type of identity document' }),
  number: t.String({ minLength: 6, maxLength: 20, description: 'Document number' }),
  documentUrl: t.String({ description: 'URL of the uploaded document' }),
  selfieUrl: t.String({ description: 'URL of the selfie with document' }),
});

export type SubmitArtistIdentityDto = typeof SubmitArtistIdentitySchema.static;

/**
 * Submit Bank Account Verification Schema (Artist)
 */
export const SubmitBankAccountSchema = t.Object({
  accountHolderName: t.String({ minLength: 2, maxLength: 200, description: 'Account holder name' }),
  accountNumber: t.String({ minLength: 8, maxLength: 20, description: 'Bank account number' }),
  ifscCode: t.String({ minLength: 11, maxLength: 11, description: 'IFSC code' }),
  bankName: t.String({ minLength: 2, maxLength: 100, description: 'Bank name' }),
  proofDocUrl: t.String({ description: 'URL of cancelled cheque or bank statement' }),
  upiId: t.Optional(t.String({ description: 'UPI ID (optional)' })),
});

export type SubmitBankAccountDto = typeof SubmitBankAccountSchema.static;

// ===================================
// ADMIN VERIFICATION SCHEMAS
// ===================================

/**
 * Admin Approve Verification Schema
 */
export const AdminApproveVerificationSchema = t.Object({
  verificationId: t.String({ description: 'Verification document ID' }),
  section: t.Union([
    t.Literal('identity'),
    t.Literal('business'),
    t.Literal('bank'),
    t.Literal('professional'),
    t.Literal('venue'),
  ], { description: 'Section to approve' }),
  venueId: t.Optional(t.String({ description: 'Venue ID (required for venue section)' })),
  notes: t.Optional(t.String({ description: 'Admin notes' })),
});

export type AdminApproveVerificationDto = typeof AdminApproveVerificationSchema.static;

/**
 * Admin Reject Verification Schema
 */
export const AdminRejectVerificationSchema = t.Object({
  verificationId: t.String({ description: 'Verification document ID' }),
  section: t.Union([
    t.Literal('identity'),
    t.Literal('business'),
    t.Literal('bank'),
    t.Literal('professional'),
    t.Literal('venue'),
  ], { description: 'Section to reject' }),
  venueId: t.Optional(t.String({ description: 'Venue ID (required for venue section)' })),
  reason: t.String({ minLength: 10, maxLength: 500, description: 'Rejection reason' }),
});

export type AdminRejectVerificationDto = typeof AdminRejectVerificationSchema.static;

/**
 * Admin Update Professional Verification Schema (Artist)
 */
export const AdminUpdateProfessionalSchema = t.Object({
  verificationId: t.String({ description: 'Verification document ID' }),
  portfolioReviewed: t.Optional(t.Boolean({ description: 'Portfolio has been reviewed' })),
  videoLinksVerified: t.Optional(t.Boolean({ description: 'Video links verified' })),
  audioSamplesVerified: t.Optional(t.Boolean({ description: 'Audio samples verified' })),
  notes: t.Optional(t.String({ description: 'Admin notes' })),
});

export type AdminUpdateProfessionalDto = typeof AdminUpdateProfessionalSchema.static;

// ===================================
// RESPONSE TYPES
// ===================================

/**
 * Verification Status Response
 */
export interface VerificationStatusResponse {
  id: string;
  userId: string;
  type: 'organizer' | 'artist';
  overallStatus: VerificationStatus;
  /**
   * Identity verification block.
   *
   * SECURITY (C6): `numberMasked` is the last 4 chars of the document number;
   * the full number is encrypted at rest and never returned. `documentUrl`
   * and `selfieUrl` are short-lived presigned S3 URLs (5 min).
   */
  identity?: {
    status: VerificationStatus;
    submittedAt?: Date;
    verifiedAt?: Date;
    rejectionReason?: string;
    numberMasked?: string;
    documentUrl?: string;
    selfieUrl?: string;
  };
  business?: {
    status: VerificationStatus;
    submittedAt?: Date;
    verifiedAt?: Date;
    rejectionReason?: string;
    panMasked?: string;
    gstMasked?: string;
    registrationDocUrl?: string;
  };
  professional?: {
    status: VerificationStatus;
    portfolioReviewed: boolean;
    videoLinksVerified: boolean;
    audioSamplesVerified: boolean;
    verifiedAt?: Date;
    notes?: string;
  };
  bankAccount?: {
    status: VerificationStatus;
    submittedAt?: Date;
    verifiedAt?: Date;
    rejectionReason?: string;
    accountNumberMasked?: string;
    ifscMasked?: string;
    proofDocUrl?: string;
  };
  venues?: {
    id: string;
    name: string;
    city: string;
    status: VerificationStatus;
    verifiedAt?: Date;
    rejectionReason?: string;
    proofDocUrl?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Admin Verification List Response
 */
export interface AdminVerificationListResponse {
  data: VerificationStatusResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
