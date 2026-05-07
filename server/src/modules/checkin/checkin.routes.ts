import { Elysia, t } from 'elysia';
import { CheckInService } from './checkin.service';
import { VerifyOtpSchema, EndEventSchema, type VerifyOtpDto } from './checkin.schemas';
import { UserRole } from '../../shared/enums';
import { getAuthUser, type RouteContext } from '../../shared/types/auth.types';
import { transformPlugin } from '../../plugins/transform.plugin';
import { ForbiddenException } from '../../plugins/error.plugin';
import { validateObjectId } from '../../shared/utils/validation.utils';

/**
 * Check-In Routes
 * Handles event check-in workflow with OTP verification
 */
export const checkinRoutes = (checkinService: CheckInService) =>
  new Elysia({ prefix: '/checkin' })
    .use(transformPlugin)

    /**
     * Generate OTP for an event (Protected - Organizer/CLIENT only)
     * POST /checkin/generate-otp/:gigId
     */
    .post(
      '/generate-otp/:gigId',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.CLIENT && user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Only organizers/clients can generate OTP');
        }
        const context = ctx as RouteContext;
        const { gigId } = context.params;
        validateObjectId(gigId, 'gigId');
        return await checkinService.generateOtp(gigId, user.userId);
      },
      {
        params: t.Object({
          gigId: t.String(),
        }),
        detail: {
          tags: ['Check-In'],
          summary: 'Generate OTP for event check-in',
          description:
            'Generate a 6-digit OTP for the artist to check in. Can only be generated 30 minutes before the event starts. Max 3 regenerations allowed.',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get current OTP (Protected - Organizer/CLIENT only)
     * GET /checkin/otp/:gigId
     */
    .get(
      '/otp/:gigId',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.CLIENT && user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Only organizers/clients can view OTP');
        }
        const context = ctx as RouteContext;
        const { gigId } = context.params;
        validateObjectId(gigId, 'gigId');
        return await checkinService.getOtp(gigId, user.userId);
      },
      {
        params: t.Object({
          gigId: t.String(),
        }),
        detail: {
          tags: ['Check-In'],
          summary: 'Get current OTP',
          description: 'Get the current OTP and its expiration time. Only the organizer can view this.',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Verify OTP and check-in (Protected - ARTIST only)
     * POST /checkin/verify-otp
     */
    .post(
      '/verify-otp',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ARTIST) {
          throw new ForbiddenException('Only artists can verify OTP');
        }
        const context = ctx as RouteContext;
        const body = context.body as VerifyOtpDto;
        return await checkinService.verifyOtp(user.userId, body);
      },
      {
        body: VerifyOtpSchema,
        detail: {
          tags: ['Check-In'],
          summary: 'Verify OTP and check-in',
          description:
            'Artist enters the 6-digit OTP to check in to the event. Optionally provide GPS location.',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Start event (Protected - Organizer only)
     * POST /checkin/start-event/:gigId
     */
    .post(
      '/start-event/:gigId',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.CLIENT && user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Only organizers can start the event');
        }
        const context = ctx as RouteContext;
        const { gigId } = context.params;
        validateObjectId(gigId, 'gigId');
        return await checkinService.startEvent(gigId, user.userId);
      },
      {
        params: t.Object({
          gigId: t.String(),
        }),
        detail: {
          tags: ['Check-In'],
          summary: 'Start the event',
          description:
            'Mark the event as started. Only the organizer can declare this after the artist has checked in.',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * End event (Protected - Both parties must confirm)
     * POST /checkin/end-event/:gigId
     */
    .post(
      '/end-event/:gigId',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { gigId } = context.params;
        validateObjectId(gigId, 'gigId');
        return await checkinService.endEvent(gigId, user.userId);
      },
      {
        params: t.Object({
          gigId: t.String(),
        }),
        detail: {
          tags: ['Check-In'],
          summary: 'End the event',
          description:
            'Confirm that the event has ended. Both the organizer and artist must call this endpoint for the event to be marked as completed.',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get check-in status (Protected - Both parties)
     * GET /checkin/status/:gigId
     */
    .get(
      '/status/:gigId',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { gigId } = context.params;
        validateObjectId(gigId, 'gigId');
        return await checkinService.getStatus(gigId, user.userId);
      },
      {
        params: t.Object({
          gigId: t.String(),
        }),
        detail: {
          tags: ['Check-In'],
          summary: 'Get check-in status',
          description:
            'Get the current check-in status for a gig. Both organizer and artist can view this.',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Cancel check-in (Protected - Organizer only)
     * POST /checkin/cancel/:gigId
     */
    .post(
      '/cancel/:gigId',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.CLIENT && user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Only organizers can cancel check-in');
        }
        const context = ctx as RouteContext;
        const { gigId } = context.params;
        validateObjectId(gigId, 'gigId');
        return await checkinService.cancelCheckIn(gigId, user.userId);
      },
      {
        params: t.Object({
          gigId: t.String(),
        }),
        detail: {
          tags: ['Check-In'],
          summary: 'Cancel check-in',
          description:
            'Cancel the check-in process. Can only be done before the event starts.',
          security: [{ BearerAuth: [] }],
        },
      }
    );
