import { UserRole, AdminRole } from '../enums';
import { UnauthorizedException } from '../errors/custom-errors';

/**
 * JWT Access Token Payload
 */
export interface JwtPayload {
  sub: string; // User ID
  firebaseUid: string;
  email?: string;
  phoneNumber?: string;
  role: UserRole;
  type: 'access';
  iat?: number; // Issued at
  exp?: number; // Expiration
}

/**
 * JWT Refresh Token Payload
 */
export interface JwtRefreshPayload {
  sub: string; // User ID
  type: 'refresh';
  iat?: number;
  exp?: number;
}

/**
 * Authenticated User Context (attached to request).
 *
 * NOTE (C5): role/status/adminRole are sourced from the DB on every request,
 * not from the JWT. The JWT contributes only userId/firebaseUid/email/phone.
 */
export interface AuthUser {
  userId: string;
  firebaseUid: string;
  email?: string;
  phoneNumber?: string;
  role: UserRole;
  /** Granular admin role; only set when role === ADMIN. */
  adminRole?: AdminRole;
}

/**
 * Auth Response (login/signup)
 */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    firebaseUid: string;
    email?: string;
    phoneNumber?: string;
    name?: string;
    role: UserRole;
    profilePicture?: string;
  };
}

/**
 * Authenticated Route Context
 * Context object passed to protected route handlers
 */
export interface AuthenticatedContext {
  user: AuthUser;
  isAuthenticated: true;
  headers: Record<string, string | undefined>;
  set: {
    headers: Record<string, string> & {
      [key: string]: string;
    };
    status?: number;
  };
  query: Record<string, string | undefined>;
  params: Record<string, string | undefined>;
  body: unknown;
  jwt: {
    sign: (payload: JwtPayload) => Promise<string>;
    verify: (token: string) => Promise<JwtPayload | false>;
  };
  refreshJwt: {
    sign: (payload: JwtRefreshPayload) => Promise<string>;
    verify: (token: string) => Promise<JwtRefreshPayload | false>;
  };
}

/**
 * Helper type for route handlers that need authentication.
 * Use with type assertion: (ctx as RouteContext)
 */
export interface RouteContext {
  user?: AuthUser;
  isAuthenticated?: boolean;
  headers: Record<string, string | undefined>;
  set: {
    headers: Record<string, string>;
    status?: number;
  };
  query: Record<string, string>;
  params: Record<string, string>;
  body: unknown;
  jwt?: {
    sign: (payload: unknown) => Promise<string>;
    verify: (token: string) => Promise<unknown | false>;
  };
  refreshJwt?: {
    sign: (payload: unknown) => Promise<string>;
    verify: (token: string) => Promise<unknown | false>;
  };
}

/**
 * Helper to get authenticated user from context.
 * Throws UnauthorizedException if user is not authenticated.
 * Normalizes the role to lowercase for consistent comparison.
 */
export function getAuthUser(ctx: unknown): AuthUser {
  const context = ctx as RouteContext;
  if (!context.user || !context.isAuthenticated) {
    throw new UnauthorizedException('User not authenticated');
  }
  // Normalize role to lowercase for consistent comparison with enums
  return {
    ...context.user,
    role: (context.user.role?.toLowerCase() as UserRole) || context.user.role,
    adminRole: context.user.adminRole,
  };
}
