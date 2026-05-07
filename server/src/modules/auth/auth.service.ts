import * as nodeCrypto from 'node:crypto';
import { UserModel } from '../../db/models';
import { firebaseAdminService } from '../../services/firebase-admin.service';
import { logger } from '../../services/logger.service';
import { AuthProvider, UserStatus, UserRole } from '../../shared/enums';
import type { JwtRefreshPayload } from '../../shared/types/auth.types';
import {
  BadRequestException,
  UnauthorizedException,
} from '../../plugins/error.plugin';

/**
 * Hash a refresh token for at-rest storage. We never store the raw JWT, so a
 * read-only DB compromise can't replay tokens directly. SHA-256 is sufficient
 * here because the input is a high-entropy signed JWT (not a user secret), so
 * a slow KDF would buy nothing meaningful and add measurable latency to every
 * refresh.
 */
function hashRefreshToken(raw: string): string {
  return nodeCrypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * True if `value` looks like a JWT (three base64url segments separated by '.').
 * Used to detect legacy raw-JWT refresh tokens stored before hashing was
 * introduced.
 */
function looksLikeJwt(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  return parts.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p));
}

/**
 * Constant-time equality on two hex strings of equal length.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return nodeCrypto.timingSafeEqual(bufA, bufB);
}

const authLogger = logger.child('AuthService');

/**
 * Pre-computed dummy hash used to equalize timing for non-existent accounts.
 * Hashed at module load so login() doesn't pay per-request hashing cost when
 * the user is missing.
 */
const DUMMY_PASSWORD_HASH_PROMISE: Promise<string> = Bun.password.hash(
  'zts-dummy-password-not-real-' + Math.random().toString(36),
  { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2 }
);

/**
 * Bun's native password hashing - 10x faster than bcrypt!
 * Uses Argon2 algorithm which is more secure and faster
 */
const hashPassword = async (password: string): Promise<string> => {
  return await Bun.password.hash(password, {
    algorithm: 'argon2id',
    memoryCost: 19456,
    timeCost: 2,
  });
};

const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return await Bun.password.verify(password, hash, 'argon2id');
};

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface CreateUserData {
  firebaseUid: string;
  email?: string;
  phoneNumber?: string;
  name?: string;
  profilePicture?: string;
  role: UserRole;
  authProvider: AuthProvider;
}

/**
 * Provider-derived profile fields surfaced to the frontend on a new-user
 * signup so the role-selection screen can pre-fill name/photo without an
 * extra round trip.
 */
export interface ProviderProfile {
  email?: string;
  phoneNumber?: string;
  displayName?: string;
  profilePicture?: string;
}

/**
 * Claims embedded in the short-lived `signupToken` issued to new users that
 * have authenticated with Firebase but not yet picked a role. The token is
 * signed with `JWT_SECRET` and rejected by the standard auth derive (which
 * requires `type === 'access'`).
 */
export interface SignupTokenClaims {
  type: 'signup';
  uid: string; // Firebase UID
  email?: string;
  phoneNumber?: string;
  name?: string;
  picture?: string;
  provider: AuthProvider;
}

/**
 * Verified-Firebase result for routes that need to either log the user in OR
 * surface a signupToken when no role has been set. Discriminated union so the
 * route layer can branch cleanly on `requiresRole`.
 */
export type FirebaseVerifyResult =
  | { requiresRole: false; user: any; firebaseUid: string }
  | {
      requiresRole: true;
      claims: SignupTokenClaims;
      providerProfile: ProviderProfile;
    };

const MAX_FAILED_LOGINS = 5;
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Whitelist of roles a user is allowed to self-assign at signup.
 * ADMIN is explicitly NOT in this list — admins are provisioned out-of-band.
 */
const SIGNUP_ALLOWED_ROLES = new Set<UserRole>([UserRole.CLIENT, UserRole.ARTIST]);

/**
 * Authentication Service
 * Handles Firebase + JWT authentication
 */
export class AuthService {
  /**
   * Verify phone OTP and authenticate user.
   *
   * If the verified user has no account yet AND no valid signup-role was sent,
   * we return `{ requiresRole: true, claims, providerProfile }` instead of
   * throwing. The route layer mints a short-lived `signupToken` from the
   * claims; the frontend uses it to call `/auth/complete-signup` once the
   * user picks a role.
   */
  async verifyPhoneOtp(
    idToken: string,
    dto: { phoneNumber: string; role?: UserRole; name?: string }
  ): Promise<FirebaseVerifyResult> {
    try {
      // Verify Firebase ID token
      const decodedToken = await firebaseAdminService.verifyIdToken(idToken);

      // Validate phone number matches
      if (decodedToken.phone_number !== dto.phoneNumber) {
        throw new BadRequestException('Phone number does not match the verified token');
      }

      // Find or create user
      let user = await UserModel.findOne({ firebaseUid: decodedToken.uid }).exec();

      // Fallback: Check by phone number — only rebind if no firebaseUid is set.
      if (!user && dto.phoneNumber) {
        user = await UserModel.findOne({ phoneNumber: dto.phoneNumber }).exec();
        if (user) {
          if (user.firebaseUid && user.firebaseUid !== decodedToken.uid) {
            authLogger.warn('Phone number already linked to a different firebaseUid; refusing silent rebind', {
              userId: user._id.toString(),
            });
            throw new UnauthorizedException(
              'This phone number is already linked to another account. Contact support to re-link.'
            );
          }
          // Bind Firebase UID to existing user (only when previously unbound)
          user.firebaseUid = decodedToken.uid;
          user.authProvider = AuthProvider.PHONE;
          await user.save();
        }
      }

      if (!user) {
        // No existing user. If the client did NOT supply a valid signup role,
        // surface a structured "needs role" response rather than throwing —
        // the frontend will route to the role-picker screen.
        if (!dto.role || !SIGNUP_ALLOWED_ROLES.has(dto.role)) {
          authLogger.info('Phone-verified user has no role yet; issuing signup challenge', {
            uid: decodedToken.uid,
          });
          return {
            requiresRole: true,
            claims: {
              type: 'signup',
              uid: decodedToken.uid,
              phoneNumber: dto.phoneNumber,
              name: dto.name,
              provider: AuthProvider.PHONE,
            },
            providerProfile: {
              phoneNumber: dto.phoneNumber,
              displayName: dto.name,
            },
          };
        }

        // Create new user (role already validated above).
        user = await UserModel.create({
          firebaseUid: decodedToken.uid,
          phoneNumber: dto.phoneNumber,
          name: dto.name,
          role: dto.role,
          authProvider: AuthProvider.PHONE,
          status: UserStatus.ACTIVE,
          joinedAt: new Date(),
          lastLogin: new Date(),
        });

        authLogger.info('New user created with phone authentication', {
          userId: user._id.toString(),
        });
      } else {
        user.lastLogin = new Date();
        await user.save();
        authLogger.info('User logged in', { userId: user._id.toString() });
      }

      this.validateUserStatus(user);

      return {
        requiresRole: false,
        user,
        firebaseUid: decodedToken.uid,
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
        throw error;
      }
      authLogger.warn('Firebase phone verification failed', {
        code: (error as { code?: string })?.code,
      });
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Verify Google ID token and authenticate user
   */
  async verifyGoogleToken(dto: {
    idToken: string;
    role?: UserRole;
    name?: string;
  }): Promise<FirebaseVerifyResult> {
    try {
      const decodedToken = await firebaseAdminService.verifyIdToken(dto.idToken);

      let user = await UserModel.findOne({ firebaseUid: decodedToken.uid }).exec();

      // Fallback: Check by email — only bind if not yet linked to a firebaseUid.
      if (!user && decodedToken.email) {
        user = await UserModel.findOne({ email: decodedToken.email }).exec();
        if (user) {
          if (user.firebaseUid && user.firebaseUid !== decodedToken.uid) {
            authLogger.warn('Email already linked to a different firebaseUid; refusing silent rebind', {
              userId: user._id.toString(),
            });
            throw new UnauthorizedException(
              'This email is already linked to another account. Contact support to re-link.'
            );
          }
          user.firebaseUid = decodedToken.uid;
          user.authProvider = AuthProvider.GOOGLE;
          await user.save();
        }
      }

      if (!user) {
        // No existing user. If the client did NOT supply a valid signup role,
        // surface a structured "needs role" response rather than throwing —
        // the frontend will route to the role-picker screen.
        if (!dto.role || !SIGNUP_ALLOWED_ROLES.has(dto.role)) {
          authLogger.info('Google-verified user has no role yet; issuing signup challenge', {
            uid: decodedToken.uid,
          });
          const displayName = dto.name || (decodedToken.name as string | undefined);
          return {
            requiresRole: true,
            claims: {
              type: 'signup',
              uid: decodedToken.uid,
              email: decodedToken.email,
              name: displayName,
              picture: decodedToken.picture,
              provider: AuthProvider.GOOGLE,
            },
            providerProfile: {
              email: decodedToken.email,
              displayName,
              profilePicture: decodedToken.picture,
            },
          };
        }

        user = await UserModel.create({
          firebaseUid: decodedToken.uid,
          email: decodedToken.email,
          name: dto.name || (decodedToken.name as string | undefined),
          profilePicture: decodedToken.picture,
          role: dto.role,
          authProvider: AuthProvider.GOOGLE,
          status: UserStatus.ACTIVE,
          joinedAt: new Date(),
          lastLogin: new Date(),
        });

        authLogger.info('New user created with Google authentication', {
          userId: user._id.toString(),
        });
      } else {
        user.lastLogin = new Date();
        await user.save();
        authLogger.info('User logged in', { userId: user._id.toString() });
      }

      this.validateUserStatus(user);

      return {
        requiresRole: false,
        user,
        firebaseUid: decodedToken.uid,
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
        throw error;
      }
      authLogger.warn('Firebase Google verification failed', {
        code: (error as { code?: string })?.code,
      });
      throw new UnauthorizedException('Invalid or expired Google token');
    }
  }

  /**
   * Complete signup using a previously-issued signupToken (verified upstream by
   * the route handler). Creates the user with the chosen role and returns the
   * fresh user record. The route layer mints the access/refresh pair.
   *
   * Re-checks for existing accounts by firebaseUid / email / phoneNumber to
   * defeat duplicate-create races where two parallel signupTokens are
   * redeemed (the second one returns the existing user as a normal login).
   */
  async completeSignup(
    claims: SignupTokenClaims,
    role: UserRole,
    name?: string
  ): Promise<{ user: any; firebaseUid: string }> {
    if (!SIGNUP_ALLOWED_ROLES.has(role)) {
      throw new BadRequestException('Invalid role for signup. Allowed: client, artist.');
    }

    // Check for existing user (race protection).
    let user = await UserModel.findOne({ firebaseUid: claims.uid }).exec();
    if (!user && claims.email) {
      user = await UserModel.findOne({ email: claims.email }).exec();
    }
    if (!user && claims.phoneNumber) {
      user = await UserModel.findOne({ phoneNumber: claims.phoneNumber }).exec();
    }

    if (user) {
      // User already exists (likely the signup completed via a parallel
      // request). Treat as a regular login rather than failing — idempotent
      // from the client's perspective.
      this.validateUserStatus(user);
      user.lastLogin = new Date();
      await user.save();
      authLogger.info('completeSignup short-circuited to login (user already exists)', {
        userId: user._id.toString(),
      });
      return { user, firebaseUid: claims.uid };
    }

    user = await UserModel.create({
      firebaseUid: claims.uid,
      email: claims.email,
      phoneNumber: claims.phoneNumber,
      name: name || claims.name,
      profilePicture: claims.picture,
      role,
      authProvider: claims.provider,
      status: UserStatus.ACTIVE,
      joinedAt: new Date(),
      lastLogin: new Date(),
    });

    authLogger.info('completeSignup: new user created', {
      userId: user._id.toString(),
      role,
      provider: claims.provider,
    });

    return { user, firebaseUid: claims.uid };
  }

  /**
   * Admin login with email/password.
   *
   * Anti-enumeration: hashes a dummy password when the user is missing so the
   * timing profile is comparable to a real verify. Throttles after
   * `MAX_FAILED_LOGINS` failures within `LOGIN_LOCKOUT_WINDOW_MS`.
   */
  async login(dto: { email: string; password: string }): Promise<{ user: any }> {
    const user = await UserModel.findOne({ email: dto.email })
      .select('+password +loginAttempts +lastFailedLoginAt')
      .exec();

    const dummyHash = await DUMMY_PASSWORD_HASH_PROMISE;

    if (!user || !user.password) {
      // Equalize timing — always perform an argon2 verify even on miss.
      await verifyPassword(dto.password, dummyHash).catch(() => false);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Throttle: if the account has accumulated too many recent failures, reject early
    // BEFORE running the (expensive) password verify.
    const now = Date.now();
    const lastFailedAt = user.lastFailedLoginAt?.getTime() ?? 0;
    const withinWindow = now - lastFailedAt < LOGIN_LOCKOUT_WINDOW_MS;
    if (withinWindow && (user.loginAttempts ?? 0) >= MAX_FAILED_LOGINS) {
      // Still run the dummy hash for timing parity.
      await verifyPassword(dto.password, dummyHash).catch(() => false);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await verifyPassword(dto.password, user.password);

    if (!isPasswordValid) {
      // Reset window if the previous failure is older than our window.
      const newAttempts = withinWindow ? (user.loginAttempts ?? 0) + 1 : 1;
      await UserModel.updateOne(
        { _id: user._id },
        { $set: { loginAttempts: newAttempts, lastFailedLoginAt: new Date() } }
      ).exec();
      throw new UnauthorizedException('Invalid credentials');
    }

    this.validateUserStatus(user);

    // Reset throttle counters on successful auth.
    user.loginAttempts = 0;
    user.lastFailedLoginAt = undefined;
    user.lastLogin = new Date();
    await user.save();

    return { user };
  }

  /**
   * Verify and rotate a refresh token. Returns the user id whose token was rotated;
   * caller mints the next access+refresh pair and stores the new refresh token via
   * {@link rotateRefreshToken}.
   *
   * Reuse detection: if the presented token is valid (signature OK) but does not
   * match the stored token, all sessions for that user are revoked.
   */
  async refreshAccessToken(refreshToken: string, refreshJwtInstance: any): Promise<string> {
    let payload: JwtRefreshPayload;
    try {
      payload = (await refreshJwtInstance.verify(refreshToken)) as JwtRefreshPayload;
    } catch (error) {
      authLogger.warn('Refresh token signature invalid', {
        code: (error as { code?: string })?.code,
      });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!payload || payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Pull stored refresh token explicitly (it's `select: false`).
    const user = await UserModel.findById(payload.sub)
      .select('+refreshToken status role')
      .exec();

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Refresh-token storage policy:
    //  - New writes: SHA-256(rawToken) hex (64 chars).
    //  - Legacy: raw JWT string (3 base64url segments). Accepted with a one-time
    //    `===` match, then re-stored as a hash on the next rotation.
    // TODO(refresh-token-legacy): remove the legacy raw-JWT branch after
    // 2026-05-21 (cutover = today + 14 days). All clients should have rotated
    // by then; any still-raw tokens after that are forced to re-login.
    let tokenIsValid = false;
    if (user.refreshToken) {
      const incomingHash = hashRefreshToken(refreshToken);
      if (
        user.refreshToken.length === incomingHash.length &&
        timingSafeEqualHex(user.refreshToken, incomingHash)
      ) {
        tokenIsValid = true;
      } else if (looksLikeJwt(user.refreshToken) && user.refreshToken === refreshToken) {
        // Legacy pre-hash row: accept once, then upgrade storage to a hash.
        tokenIsValid = true;
        authLogger.info('Upgrading legacy raw refresh token to hashed storage', {
          userId: user._id.toString(),
        });
        user.refreshToken = incomingHash;
        await user.save();
      }
    }

    if (!tokenIsValid) {
      // Token reuse: signature was valid but it's not the currently-stored token.
      // This is the classic indicator of a stolen+replayed token. Revoke all sessions.
      authLogger.warn('Refresh token reuse detected; revoking all sessions', {
        userId: user._id.toString(),
      });
      user.refreshToken = undefined;
      await user.save();
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    this.validateUserStatus(user);

    return user._id.toString();
  }

  /**
   * Atomically swap a user's stored refresh token. Used after rotation; the
   * `oldToken` is part of the filter so a stolen token can't replay-rotate
   * once the legitimate client has rotated.
   *
   * Returns true if the swap actually happened (i.e., oldToken was current);
   * false otherwise — caller should treat false as a reuse signal.
   */
  async rotateRefreshToken(
    userId: string,
    oldToken: string,
    newToken: string
  ): Promise<boolean> {
    const oldHash = hashRefreshToken(oldToken);
    const newHash = hashRefreshToken(newToken);

    // Primary path: stored value is the hashed form.
    let result = await UserModel.updateOne(
      { _id: userId, refreshToken: oldHash },
      { $set: { refreshToken: newHash } }
    ).exec();

    // TODO(refresh-token-legacy): remove this legacy fallback after
    // 2026-05-21 (cutover = today + 14 days). It accepts a row that still
    // holds the raw JWT and upgrades it to the hashed form.
    if (result.modifiedCount !== 1) {
      result = await UserModel.updateOne(
        { _id: userId, refreshToken: oldToken },
        { $set: { refreshToken: newHash } }
      ).exec();
    }

    return result.modifiedCount === 1;
  }

  /**
   * Logout user
   */
  async logout(userId: string): Promise<void> {
    await UserModel.findByIdAndUpdate(userId, { refreshToken: null }).exec();
    authLogger.info('User logged out', { userId });
  }

  /**
   * Get current user
   */
  async getCurrentUser(userId: string): Promise<any> {
    const user = await UserModel.findById(userId).exec();
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.mapUserToDto(user);
  }

  /**
   * Update refresh token (used right after issuing a new pair on login/signup).
   */
  async updateRefreshToken(userId: string, refreshToken: string | null): Promise<void> {
    // Store only the hash; never persist the raw JWT.
    const stored = refreshToken === null ? null : hashRefreshToken(refreshToken);
    await UserModel.findByIdAndUpdate(userId, { refreshToken: stored }).exec();
  }

  /**
   * Validate user status.
   *
   * SECURITY (M7): leak-resistant — all non-ACTIVE statuses produce the same
   * client-facing message; the actual status is logged server-side for ops.
   */
  private validateUserStatus(user: any): void {
    if (user.status === UserStatus.ACTIVE) return;

    authLogger.info('Login blocked by user status', {
      userId: user._id?.toString(),
      status: user.status,
    });
    throw new UnauthorizedException('Account is not available. Contact support.');
  }

  /**
   * Map User to DTO - includes full profile data
   */
  private mapUserToDto(user: any) {
    const dto: Record<string, any> = {
      id: user._id.toString(),
      firebaseUid: user.firebaseUid,
      email: user.email,
      phoneNumber: user.phoneNumber,
      name: user.name,
      profilePicture: user.profilePicture,
      role: user.role,
      authProvider: user.authProvider,
      status: user.status,
      isVerified: user.isVerified || false,
      joinedAt: user.joinedAt,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    // Include adminRole only for admins (used by admin panel UI to show menus).
    if (user.role === UserRole.ADMIN && user.adminRole) {
      dto.adminRole = user.adminRole;
    }

    // Include artistProfile for artists
    if (user.artistProfile && user.role === UserRole.ARTIST) {
      dto.artistProfile = {
        stageName: user.artistProfile.stageName,
        bio: user.artistProfile.bio,
        genres: user.artistProfile.genres || [],
        performanceTypes: user.artistProfile.performanceTypes || [],
        instruments: user.artistProfile.instruments || [],
        languages: user.artistProfile.languages || [],
        yearsOfExperience: user.artistProfile.yearsOfExperience,
        baseRate: user.artistProfile.baseRate,
        location: user.artistProfile.location,
        videoLinks: user.artistProfile.videoLinks || [],
        audioSamples: user.artistProfile.audioSamples || [],
        instagramHandle: user.artistProfile.instagramHandle,
        onboardingComplete: user.artistProfile.onboardingComplete || false,
      };
    }

    // Include clientProfile for clients
    if (user.clientProfile && user.role === UserRole.CLIENT) {
      dto.clientProfile = {
        companyName: user.clientProfile.company,
        location: user.clientProfile.location,
      };
    }

    return dto;
  }
}
