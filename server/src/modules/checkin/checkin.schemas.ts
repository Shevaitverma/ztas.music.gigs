import { t } from 'elysia';

/**
 * Verify OTP Schema
 *
 * Artist uses this to check-in by entering the OTP. `location` is REQUIRED:
 * the server enforces a maximum distance between this point and the venue's
 * stored geoPoint as part of the trust mechanism (see CheckInService.verifyOtp
 * and OTP_GPS_TOLERANCE_METERS).
 */
export const VerifyOtpSchema = t.Object({
  gigId: t.String({ description: 'The gig ID to check in for' }),
  otp: t.String({
    minLength: 6,
    maxLength: 6,
    pattern: '^[0-9]{6}$',
    description: '6-digit OTP code',
  }),
  location: t.Object(
    {
      lat: t.Number({ minimum: -90, maximum: 90, description: 'Latitude (-90..90)' }),
      lng: t.Number({ minimum: -180, maximum: 180, description: 'Longitude (-180..180)' }),
    },
    { description: 'Required GPS coordinates for venue-proximity verification' }
  ),
});

/**
 * Verify OTP DTO
 */
export type VerifyOtpDto = typeof VerifyOtpSchema.static;

/**
 * End Event Schema
 * Both parties use this to confirm the event has ended
 */
export const EndEventSchema = t.Object({
  gigId: t.String({ description: 'The gig ID to end' }),
});

/**
 * End Event DTO
 */
export type EndEventDto = typeof EndEventSchema.static;

/**
 * Check-In Response
 */
export interface CheckInResponse {
  id: string;
  gigId: string;
  bidId: string;
  artistId: string;
  organizerId: string;
  status: string;
  otp?: string; // Only returned to organizer
  otpExpiresAt?: Date;
  otpRegenerateCount?: number;
  artistCheckedInAt?: Date;
  eventStartedAt?: Date;
  eventEndedAt?: Date;
  endConfirmation?: {
    organizerConfirmed: boolean;
    artistConfirmed: boolean;
  };
  artistLocation?: {
    lat: number;
    lng: number;
    capturedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * OTP Response (for organizer viewing OTP)
 */
export interface OtpResponse {
  otp: string;
  expiresAt: Date;
  regenerateCount: number;
  maxRegenerations: number;
}
