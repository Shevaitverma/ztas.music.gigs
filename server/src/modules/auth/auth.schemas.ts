import { t } from 'elysia';
import { UserRole } from '../../shared/enums';

/**
 * Roles that can be self-assigned at signup.
 *
 * SECURITY: ADMIN is intentionally excluded — admins are provisioned out-of-band.
 * If you ever need to widen this, do it explicitly here.
 */
const SignupRoleSchema = t.Union([
  t.Literal(UserRole.CLIENT),
  t.Literal(UserRole.ARTIST),
]);

/**
 * Schema for verifying phone OTP
 */
export const VerifyOtpSchema = t.Object({
  phoneNumber: t.String({
    pattern: '^\\+[1-9]\\d{1,14}$',
    description: 'Phone number with country code (E.164 format)',
    examples: ['+919876543210'],
  }),
  otp: t.Optional(
    t.String({
      minLength: 4,
      maxLength: 6,
      description: 'OTP code (optional - verified by Firebase)',
    })
  ),
  role: t.Optional(SignupRoleSchema),
  name: t.Optional(
    t.String({
      minLength: 1,
      maxLength: 100,
      description: 'User display name',
    })
  ),
});

/**
 * Schema for Google authentication
 */
export const GoogleAuthSchema = t.Object({
  idToken: t.String({
    minLength: 1,
    description: 'Firebase ID token from Google Sign-In',
  }),
  role: t.Optional(SignupRoleSchema),
  name: t.Optional(
    t.String({
      minLength: 1,
      maxLength: 100,
      description: 'User display name (overrides Google name)',
    })
  ),
});

/**
 * Schema for admin login
 */
export const LoginSchema = t.Object({
  email: t.String({
    format: 'email',
    description: 'Admin email address',
    examples: ['admin@example.com'],
  }),
  password: t.String({
    minLength: 6,
    description: 'Admin password',
  }),
});

/**
 * Schema for refresh token
 */
export const RefreshTokenSchema = t.Object({
  refreshToken: t.Optional(
    t.String({
      minLength: 1,
      description:
        'JWT refresh token. Optional when the `refreshToken` cookie is sent (preferred for browser clients).',
    })
  ),
});

/**
 * Schema for completing signup with a previously-issued signupToken.
 *
 * The signupToken is short-lived (10 min), HMAC-signed with JWT_SECRET, and
 * carries the verified Firebase identity (uid + email/phone). The role is
 * supplied here so the server can create the user with the chosen role.
 */
export const CompleteSignupSchema = t.Object({
  signupToken: t.String({ minLength: 1, description: 'Short-lived signup JWT' }),
  role: SignupRoleSchema,
  name: t.Optional(
    t.String({ minLength: 1, maxLength: 100, description: 'Optional override for display name' })
  ),
});

export type CompleteSignupDto = typeof CompleteSignupSchema.static;

// Type exports for TypeScript
export type SignupRole = typeof SignupRoleSchema.static;
export type VerifyOtpDto = typeof VerifyOtpSchema.static;
export type GoogleAuthDto = typeof GoogleAuthSchema.static;
export type LoginDto = typeof LoginSchema.static;
export type RefreshTokenDto = typeof RefreshTokenSchema.static;
