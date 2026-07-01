import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { AuthService } from './auth.service';
import type { SignupTokenClaims } from './auth.service';
import {
  GoogleAuthSchema,
  PhoneAuthSchema,
  LoginSchema,
  RefreshTokenSchema,
  CompleteSignupSchema,
} from './auth.schemas';
import type { JwtPayload, JwtRefreshPayload, RouteContext } from '../../shared/types/auth.types';
import { getAuthUser } from '../../shared/types/auth.types';
import { transformPlugin } from '../../plugins/transform.plugin';
import { UserRole } from '../../shared/enums';
import { UnauthorizedException } from '../../plugins/error.plugin';
import { config } from '../../config';
import { setAuthCookies, clearAuthCookies, type CookieJar } from '../../shared/utils/cookies';

/**
 * Lifetime of the short-lived `signupToken` issued to users that authenticated
 * with Firebase but haven't picked a role. 10 minutes is enough for the user
 * to see the role-picker screen and submit; long enough to cover network
 * blips, short enough that a leaked token has limited blast radius.
 */
const SIGNUP_TOKEN_EXP = '10m';

/**
 * Auth Routes
 */
export const authRoutes = (authService: AuthService) =>
  new Elysia({ prefix: '/auth' })
    .use(transformPlugin)
    // Dedicated JWT instance for the short-lived signupToken issued during
    // role-picking. Signed with JWT_SECRET so signature is unforgeable, but
    // tokens have `type: 'signup'` and so are rejected by the standard auth
    // derive (which requires `type === 'access'`).
    .use(
      jwt({
        name: 'signupJwt',
        secret: config.jwt.secret,
        exp: SIGNUP_TOKEN_EXP,
      })
    )
    /**
     * Google Sign-In Verification (Public)
     */
    .post(
      '/google/verify',
      async (ctx) => {
        const context = ctx as RouteContext;
        const { body } = context;
        const jwt = context.jwt!;
        const refreshJwt = context.refreshJwt!;
        const signupJwt = (ctx as any).signupJwt as {
          sign: (payload: unknown) => Promise<string>;
        };

        const result = await authService.verifyGoogleToken(
          body as { idToken: string; role?: UserRole; name?: string }
        );

        // No role yet → return signup challenge instead of access tokens.
        if (result.requiresRole) {
          const signupToken = await signupJwt.sign(result.claims);
          return {
            requiresRole: true,
            signupToken,
            providerProfile: result.providerProfile,
          };
        }

        // Generate JWT tokens
        const accessPayload: JwtPayload = {
          sub: result.user._id.toString(),
          firebaseUid: result.firebaseUid,
          email: result.user.email,
          phoneNumber: result.user.phoneNumber,
          role: result.user.role,
          type: 'access',
        };

        const refreshPayload: JwtRefreshPayload = {
          sub: result.user._id.toString(),
          type: 'refresh',
        };

        const accessToken = await jwt.sign(accessPayload);
        const refreshToken = await refreshJwt.sign(refreshPayload);

        // Store refresh token
        await authService.updateRefreshToken(result.user._id.toString(), refreshToken);

        // Additive: also set httpOnly cookies for browser clients.
        setAuthCookies((ctx as { cookie: CookieJar }).cookie, { accessToken, refreshToken });

        return {
          requiresRole: false,
          accessToken,
          refreshToken,
          user: {
            id: result.user._id.toString(),
            firebaseUid: result.user.firebaseUid,
            email: result.user.email,
            phoneNumber: result.user.phoneNumber,
            name: result.user.name,
            role: result.user.role,
            profilePicture: result.user.profilePicture,
          },
        };
      },
      {
        body: GoogleAuthSchema,
        detail: {
          tags: ['Auth'],
          summary: 'Verify Google Sign-In',
          description: 'Verify Firebase Google ID token and authenticate user',
        },
      }
    )

    /**
     * Phone (OTP) Sign-In Verification (Public) — SRV-002.
     *
     * Mirrors /google/verify for Firebase phone-OTP login (the primary India
     * onboarding path). The Firebase ID token is read from the `X-Firebase-Token`
     * header (documented contract) or body `idToken`. New users without a role
     * get the same structured signup challenge as the Google path.
     */
    .post(
      '/phone/verify',
      async (ctx) => {
        const context = ctx as RouteContext;
        const { body } = context;
        const jwt = context.jwt!;
        const refreshJwt = context.refreshJwt!;
        const signupJwt = (ctx as any).signupJwt as {
          sign: (payload: unknown) => Promise<string>;
        };

        const bodyTyped = (body ?? {}) as { idToken?: string; role?: UserRole; name?: string };
        // Header takes precedence (documented contract); fall back to body.
        const headerToken = context.headers['x-firebase-token'];
        const idToken = (typeof headerToken === 'string' && headerToken.length > 0)
          ? headerToken
          : bodyTyped.idToken;
        if (!idToken) {
          throw new UnauthorizedException(
            'Firebase token required (X-Firebase-Token header or idToken body)'
          );
        }

        const result = await authService.verifyPhoneToken({
          idToken,
          role: bodyTyped.role,
          name: bodyTyped.name,
        });

        // No role yet → return signup challenge instead of access tokens.
        if (result.requiresRole) {
          const signupToken = await signupJwt.sign(result.claims);
          return {
            requiresRole: true,
            signupToken,
            providerProfile: result.providerProfile,
          };
        }

        const accessPayload: JwtPayload = {
          sub: result.user._id.toString(),
          firebaseUid: result.firebaseUid,
          email: result.user.email,
          phoneNumber: result.user.phoneNumber,
          role: result.user.role,
          type: 'access',
        };
        const refreshPayload: JwtRefreshPayload = {
          sub: result.user._id.toString(),
          type: 'refresh',
        };

        const accessToken = await jwt.sign(accessPayload);
        const refreshToken = await refreshJwt.sign(refreshPayload);

        await authService.updateRefreshToken(result.user._id.toString(), refreshToken);

        // Additive: also set httpOnly cookies for browser clients.
        setAuthCookies((ctx as { cookie: CookieJar }).cookie, { accessToken, refreshToken });

        return {
          requiresRole: false,
          accessToken,
          refreshToken,
          user: {
            id: result.user._id.toString(),
            firebaseUid: result.user.firebaseUid,
            email: result.user.email,
            phoneNumber: result.user.phoneNumber,
            name: result.user.name,
            role: result.user.role,
            profilePicture: result.user.profilePicture,
          },
        };
      },
      {
        body: PhoneAuthSchema,
        detail: {
          tags: ['Auth'],
          summary: 'Verify Phone (OTP) Sign-In',
          description:
            'Verify a Firebase phone ID token (X-Firebase-Token header or idToken body) and authenticate the user.',
        },
      }
    )

    /**
     * Admin Login (Public)
     */
    .post(
      '/login',
      async (ctx) => {
        const context = ctx as RouteContext;
        const { body } = context;
        const jwt = context.jwt!;
        const refreshJwt = context.refreshJwt!;

        const result = await authService.login(body as { email: string; password: string });

        // Generate JWT tokens
        const accessPayload: JwtPayload = {
          sub: result.user._id.toString(),
          firebaseUid: result.user.firebaseUid,
          email: result.user.email,
          phoneNumber: result.user.phoneNumber,
          role: result.user.role,
          type: 'access',
        };

        const refreshPayload: JwtRefreshPayload = {
          sub: result.user._id.toString(),
          type: 'refresh',
        };

        const accessToken = await jwt.sign(accessPayload);
        const refreshToken = await refreshJwt.sign(refreshPayload);

        // Store refresh token
        await authService.updateRefreshToken(result.user._id.toString(), refreshToken);

        // Additive: also set httpOnly cookies for browser clients.
        setAuthCookies((ctx as { cookie: CookieJar }).cookie, { accessToken, refreshToken });

        return {
          accessToken,
          refreshToken,
          user: {
            id: result.user._id.toString(),
            firebaseUid: result.user.firebaseUid,
            email: result.user.email,
            phoneNumber: result.user.phoneNumber,
            name: result.user.name,
            role: result.user.role,
            profilePicture: result.user.profilePicture,
          },
        };
      },
      {
        body: LoginSchema,
        detail: {
          tags: ['Auth'],
          summary: 'Admin login',
          description: 'Login with email and password (Admin only)',
        },
      }
    )

    /**
     * Refresh Access + Refresh Token (Public).
     *
     * SECURITY (C4): refresh tokens rotate on every use. The presented token is
     * atomically swapped for a new one; if the swap fails (concurrent use of the
     * same token / stolen token replay), the user's session is revoked.
     */
    .post(
      '/refresh',
      async (ctx) => {
        const context = ctx as RouteContext;
        const { body } = context;
        const jwt = context.jwt!;
        const refreshJwt = context.refreshJwt!;
        const cookieJar = (ctx as { cookie?: CookieJar }).cookie;
        const cookieRefresh = cookieJar?.refreshToken?.value;
        const bodyRefresh = (body as { refreshToken?: string } | undefined)?.refreshToken;
        // Prefer the httpOnly cookie when present; fall back to the request body
        // for backward compatibility with native/legacy clients.
        const presentedRefreshToken =
          (typeof cookieRefresh === 'string' && cookieRefresh.length > 0
            ? cookieRefresh
            : undefined) || bodyRefresh;

        if (!presentedRefreshToken) {
          throw new UnauthorizedException('Refresh token required');
        }

        // Validate signature, type, status; also detects reuse where the token
        // signature is valid but it's not the currently-stored token.
        const userId = await authService.refreshAccessToken(presentedRefreshToken, refreshJwt);

        // Pull current user (already validated as ACTIVE by refreshAccessToken).
        const user = await authService.getCurrentUser(userId);

        // Mint a NEW pair.
        const accessPayload: JwtPayload = {
          sub: userId,
          firebaseUid: user.firebaseUid,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          type: 'access',
        };
        const refreshPayload: JwtRefreshPayload = { sub: userId, type: 'refresh' };

        const newAccessToken = await jwt.sign(accessPayload);
        const newRefreshToken = await refreshJwt.sign(refreshPayload);

        // Atomic swap: only succeeds if the stored token is still the presented one.
        // If two concurrent requests both pass refreshAccessToken, only one will
        // succeed here; the loser is treated as reuse and the session is revoked.
        const swapped = await authService.rotateRefreshToken(
          userId,
          presentedRefreshToken,
          newRefreshToken
        );
        if (!swapped) {
          await authService.updateRefreshToken(userId, null);
          throw new UnauthorizedException('Refresh token reuse detected');
        }

        // Additive: refresh both httpOnly cookies (rotated pair) for browser clients.
        if (cookieJar) {
          setAuthCookies(cookieJar, {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
          });
        }

        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
      },
      {
        body: RefreshTokenSchema,
        detail: {
          tags: ['Auth'],
          summary: 'Refresh access token',
          description: 'Rotate refresh token and issue a new access token',
        },
      }
    )

    /**
     * Complete Signup (Public).
     *
     * Redeems a short-lived signupToken (issued by `/auth/google/verify` when
     * the user has no role yet), creates the user
     * with the chosen role, and returns the standard access/refresh token
     * pair. Idempotent: if the user already exists (e.g., race), this returns
     * a normal login response.
     */
    .post(
      '/complete-signup',
      async (ctx) => {
        const context = ctx as RouteContext;
        const { body } = context;
        const jwt = context.jwt!;
        const refreshJwt = context.refreshJwt!;
        const signupJwt = (ctx as any).signupJwt as {
          verify: (token: string) => Promise<unknown | false>;
        };

        const { signupToken, role, name } = body as {
          signupToken: string;
          role: UserRole;
          name?: string;
        };

        let claims: SignupTokenClaims;
        try {
          const verified = await signupJwt.verify(signupToken);
          if (!verified || typeof verified !== 'object') {
            throw new UnauthorizedException('Invalid or expired signup token');
          }
          claims = verified as SignupTokenClaims;
        } catch {
          throw new UnauthorizedException('Invalid or expired signup token');
        }

        // Strict type-claim check: a signupToken MUST NOT be redeemable as
        // anything else (and our standard auth derive already rejects it
        // because it requires `type === 'access'`).
        if (claims.type !== 'signup' || !claims.uid) {
          throw new UnauthorizedException('Invalid signup token');
        }

        const result = await authService.completeSignup(claims, role, name);

        // Mint normal access + refresh pair.
        const accessPayload: JwtPayload = {
          sub: result.user._id.toString(),
          firebaseUid: result.firebaseUid,
          email: result.user.email,
          phoneNumber: result.user.phoneNumber,
          role: result.user.role,
          type: 'access',
        };
        const refreshPayload: JwtRefreshPayload = {
          sub: result.user._id.toString(),
          type: 'refresh',
        };
        const accessToken = await jwt.sign(accessPayload);
        const refreshToken = await refreshJwt.sign(refreshPayload);
        await authService.updateRefreshToken(result.user._id.toString(), refreshToken);

        // Additive: also set httpOnly cookies for browser clients.
        setAuthCookies((ctx as { cookie: CookieJar }).cookie, { accessToken, refreshToken });

        return {
          accessToken,
          refreshToken,
          user: {
            id: result.user._id.toString(),
            firebaseUid: result.user.firebaseUid,
            email: result.user.email,
            phoneNumber: result.user.phoneNumber,
            name: result.user.name,
            role: result.user.role,
            profilePicture: result.user.profilePicture,
          },
        };
      },
      {
        body: CompleteSignupSchema,
        detail: {
          tags: ['Auth'],
          summary: 'Complete signup with role selection',
          description:
            'Redeem a signupToken (returned by /auth/google/verify when requiresRole=true) and create the user with the chosen role.',
        },
      }
    )

    /**
     * Logout (Protected)
     *
     * Idempotent: clears both auth cookies and revokes the stored refresh token
     * server-side. Accepts auth via Bearer header OR `accessToken` cookie (the
     * derive resolves either).
     */
    .post(
      '/logout',
      async (ctx) => {
        const user = getAuthUser(ctx);
        await authService.logout(user.userId);
        const cookieJar = (ctx as { cookie?: CookieJar }).cookie;
        if (cookieJar) clearAuthCookies(cookieJar);
        return { success: true };
      },
      {
        detail: {
          tags: ['Auth'],
          summary: 'Logout',
          description:
            'Logout user: revokes the stored refresh token and clears the accessToken/refreshToken cookies. Idempotent.',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * WebSocket Ticket (Protected).
     *
     * Returns a short-lived JWT (`type: 'ws-ticket'`, exp = 30s) the client
     * passes as `?ticket=` when opening a WebSocket. Lets browser clients
     * authenticate WS connections without exposing the long-lived access token
     * via query string. The standard auth derive rejects ws-ticket tokens for
     * HTTP requests (it requires `type === 'access'`).
     */
    .get(
      '/ws-ticket',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const jwt = context.jwt!;
        const nowSec = Math.floor(Date.now() / 1000);
        const ticket = await jwt.sign({
          type: 'ws-ticket',
          uid: user.userId,
          exp: nowSec + 30,
        });
        return { ticket };
      },
      {
        detail: {
          tags: ['Auth'],
          summary: 'Issue a short-lived WebSocket ticket',
          description:
            'Returns a 30-second JWT (type=ws-ticket) for WS authentication via ?ticket= query param.',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get Current User (Protected)
     */
    .get(
      '/me',
      async (ctx) => {
        const user = getAuthUser(ctx);
        return await authService.getCurrentUser(user.userId);
      },
      {
        detail: {
          tags: ['Auth'],
          summary: 'Get current user',
          description: 'Get current authenticated user information',
          security: [{ BearerAuth: [] }],
        },
      }
    );
