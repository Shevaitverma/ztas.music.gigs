import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { bearer } from '@elysiajs/bearer';
import { errorPlugin } from './plugins/error.plugin';
import { loggingPlugin } from './plugins/logging.plugin';
import { securityPlugin } from './plugins/security.plugin';
import { compressionPlugin } from './plugins/compression.plugin';
import { transformPlugin } from './plugins/transform.plugin';
import { corsPlugin } from './plugins/cors.plugin';
import { swaggerPlugin } from './plugins/swagger.plugin';
import { config } from './config';
import { authModule } from './modules/auth';
import { usersModule } from './modules/users';
import { gigsModule } from './modules/gigs';
import { bidsModule } from './modules/bids';
import { applicationsModule } from './modules/applications';
import { venuesModule } from './modules/venues';
import { adminModule } from './modules/admin';
import { reviewsModule } from './modules/reviews';
import { reportsModule } from './modules/reports';
import { checkinModule } from './modules/checkin';
import { verificationModule } from './modules/verification';
import { notificationsModule } from './modules/notifications';
import { UserModel, isConnected } from './db';
import type { AuthUser, JwtPayload } from './shared/types/auth.types';
import { UserStatus, UserRole, AdminRole } from './shared/enums';

/**
 * Create the Elysia application with all plugins and routes
 * Configured for maximum performance and industry-standard practices
 */
export function createApp() {
	const app = new Elysia({ name: 'zts-music-api' })
		// ===== Core Plugins (Order Matters!) =====

		// 1. Error handling first - catches all errors
		.use(errorPlugin())

		// 2. Security headers and rate limiting
		.use(
			securityPlugin({
				rateLimit: {
					max: config.app.nodeEnv === 'production' ? 100 : 1000, // More lenient in dev
					windowMs: 60000, // 1 minute window
				},
			}),
		)

		// 3. Logging with request tracking
		.use(loggingPlugin())

		// 4. CORS configuration
		.use(corsPlugin(config.cors.origins))

		// 5. API documentation — gated to non-production. Mounting Swagger in
		//    prod exposes the full API surface (including admin) to anyone who
		//    can reach the host.
		.use(
			config.app.nodeEnv !== 'production'
				? swaggerPlugin()
				: new Elysia({ name: 'swagger-disabled' }),
		)

		// 6. Bearer token extraction
		.use(bearer())

		// 7. Response compression (last in chain, before sending)
		.use(compressionPlugin({ threshold: 1024 }))

		// ===== JWT Configuration =====
		.use(
			jwt({
				name: 'jwt',
				secret: config.jwt.secret,
				exp: config.jwt.expiresIn,
			}),
		)
		.use(
			jwt({
				name: 'refreshJwt',
				secret: config.jwt.refreshSecret,
				exp: config.jwt.refreshExpiresIn,
			}),
		)

		// ===== Authentication Derive =====
		.derive(async ({ headers, jwt, cookie }) => {
			const authHeader = headers.authorization;

			// Prefer Authorization: Bearer <token>; fall back to httpOnly cookie
			// `accessToken` so browser clients can authenticate without exposing
			// the JWT to JS. The token still must satisfy `payload.type === 'access'`.
			let token: string | undefined;
			if (authHeader && authHeader.startsWith('Bearer ')) {
				token = authHeader.substring(7);
			} else {
				const cookieToken = (cookie as Record<string, { value?: string } | undefined> | undefined)
					?.accessToken?.value;
				if (cookieToken && typeof cookieToken === 'string' && cookieToken.length > 0) {
					token = cookieToken;
				}
			}

			if (!token) {
				return { user: undefined, isAuthenticated: false };
			}

			try {
				const payload = await jwt.verify(token);

				if (!payload) {
					return { user: undefined, isAuthenticated: false };
				}

				// Safely cast through unknown to validate type
				const jwtPayload = payload as unknown as JwtPayload;

				if (jwtPayload.type !== 'access') {
					return { user: undefined, isAuthenticated: false };
				}

				// SECURITY (C5): role/status/adminRole are sourced from the DB on
				// every request — JWT claims are NOT trusted for authorization.
				// This way bans, role changes, and admin demotions take effect
				// within the next request rather than after JWT expiry.
				const user = await UserModel.findById(jwtPayload.sub)
					.select('status role adminRole')
					.lean()
					.exec();

				if (!user || user.status !== UserStatus.ACTIVE) {
					return { user: undefined, isAuthenticated: false };
				}

				const authUser: AuthUser = {
					userId: jwtPayload.sub,
					firebaseUid: jwtPayload.firebaseUid,
					email: jwtPayload.email,
					phoneNumber: jwtPayload.phoneNumber,
					role: user.role as UserRole,
					adminRole: (user.adminRole as AdminRole | null | undefined) ?? undefined,
				};

				return { user: authUser, isAuthenticated: true };
			} catch {
				// Don't log token contents — could leak the bearer token in stdout.
				return { user: undefined, isAuthenticated: false };
			}
		})

		// ===== Health Check Endpoint (Deep Health Check) =====
		.get(
			'/health',
			async ({ set }) => {
				const dbHealthy = isConnected();
				const memUsage = process.memoryUsage();

				// Set status based on health
				if (!dbHealthy) {
					set.status = 503; // Service Unavailable
				}

				return {
					status: dbHealthy ? 'healthy' : 'degraded',
					timestamp: new Date().toISOString(),
					uptime: Math.round(process.uptime()),
					environment: config.app.nodeEnv,
					version: '1.0.0',
					checks: {
						database: dbHealthy ? 'connected' : 'disconnected',
						memory: 'ok',
					},
					memory: {
						heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
						heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
						rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
					},
				};
			},
			{
				detail: {
					tags: ['Health'],
					summary: 'Health check',
					description: 'Deep health check including database connectivity and memory usage',
				},
			},
		)

		// ===== Liveness Probe (Kubernetes/Docker) =====
		.get('/live', () => ({ status: 'ok' }), {
			detail: {
				tags: ['Health'],
				summary: 'Liveness probe',
				description: 'Simple liveness check for container orchestration',
			},
		})

		// ===== Readiness Probe (Kubernetes/Docker) =====
		.get(
			'/ready',
			async ({ set }) => {
				const dbHealthy = isConnected();

				if (!dbHealthy) {
					set.status = 503;
					return { status: 'not_ready', reason: 'Database not connected' };
				}

				return { status: 'ready' };
			},
			{
				detail: {
					tags: ['Health'],
					summary: 'Readiness probe',
					description: 'Check if service is ready to accept traffic',
				},
			},
		)

		// ===== Root Endpoint =====
		.get(
			'/',
			() => ({
				message: 'ZTS Music Platform API.....',
				version: '1.0.0',
				documentation: '/api/docs',
				health: '/health',
			}),
			{
				detail: {
					tags: ['Info'],
					summary: 'API information',
					description: 'Get basic API information',
				},
			},
		)

		// ===== API v1 Routes =====
		.group('/api/v1', (app) =>
			app
				.use(authModule())
				.use(usersModule())
				.use(gigsModule())
				.use(bidsModule())
				.use(applicationsModule())
				.use(venuesModule())
				.use(adminModule())
				.use(reviewsModule())
				.use(reportsModule())
				.use(checkinModule())
				.use(verificationModule())
				.use(notificationsModule())

				// Test/Debug endpoint
				.get(
					'/ping',
					({ user, isAuthenticated }) => ({
						pong: true,
						authenticated: isAuthenticated,
						user: user || null,
						timestamp: new Date().toISOString(),
					}),
					{
						detail: {
							tags: ['Test'],
							summary: 'Ping endpoint',
							description: 'Test endpoint to check authentication status and server connectivity',
						},
					},
				),
		);

	return app;
}
