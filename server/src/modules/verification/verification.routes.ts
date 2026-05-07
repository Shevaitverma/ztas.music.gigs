import { Elysia, t } from 'elysia';
import { VerificationService } from './verification.service';
import {
  SubmitOrganizerIdentitySchema,
  SubmitBusinessSchema,
  SubmitVenueSchema,
  SubmitArtistIdentitySchema,
  SubmitBankAccountSchema,
  AdminApproveVerificationSchema,
  AdminRejectVerificationSchema,
  AdminUpdateProfessionalSchema,
  type SubmitOrganizerIdentityDto,
  type SubmitBusinessDto,
  type SubmitVenueDto,
  type SubmitArtistIdentityDto,
  type SubmitBankAccountDto,
  type AdminApproveVerificationDto,
  type AdminRejectVerificationDto,
  type AdminUpdateProfessionalDto,
} from './verification.schemas';
import { UserRole, VerificationStatus } from '../../shared/enums';
import { getAuthUser, type RouteContext } from '../../shared/types/auth.types';
import { transformPlugin } from '../../plugins/transform.plugin';
import { ForbiddenException } from '../../plugins/error.plugin';
import { validateObjectId } from '../../shared/utils/validation.utils';

/**
 * Verification Routes
 * Handles verification workflow for organizers and artists
 */
export const verificationRoutes = (verificationService: VerificationService) =>
  new Elysia({ prefix: '/verification' })
    .use(transformPlugin)

    // ===================================
    // ORGANIZER VERIFICATION ROUTES
    // ===================================

    /**
     * Submit identity verification (Organizer)
     * POST /verification/organizer/identity
     */
    .post(
      '/organizer/identity',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.CLIENT && user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Only organizers/clients can submit identity verification');
        }
        const context = ctx as RouteContext;
        const body = context.body as SubmitOrganizerIdentityDto;
        return await verificationService.submitOrganizerIdentity(user.userId, body);
      },
      {
        body: SubmitOrganizerIdentitySchema,
        detail: {
          tags: ['Verification'],
          summary: 'Submit identity verification (Organizer)',
          description: 'Submit identity documents for KYC verification',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Submit business verification (Organizer)
     * POST /verification/organizer/business
     */
    .post(
      '/organizer/business',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.CLIENT && user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Only organizers/clients can submit business verification');
        }
        const context = ctx as RouteContext;
        const body = context.body as SubmitBusinessDto;
        return await verificationService.submitBusiness(user.userId, body);
      },
      {
        body: SubmitBusinessSchema,
        detail: {
          tags: ['Verification'],
          summary: 'Submit business verification (Organizer)',
          description: 'Submit business registration documents',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Submit venue verification (Organizer)
     * POST /verification/organizer/venue
     */
    .post(
      '/organizer/venue',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.CLIENT && user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Only organizers/clients can submit venue verification');
        }
        const context = ctx as RouteContext;
        const body = context.body as SubmitVenueDto;
        return await verificationService.submitVenue(user.userId, body);
      },
      {
        body: SubmitVenueSchema,
        detail: {
          tags: ['Verification'],
          summary: 'Submit venue verification (Organizer)',
          description: 'Submit venue proof documents',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get organizer verification status
     * GET /verification/organizer/status
     */
    .get(
      '/organizer/status',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.CLIENT && user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Only organizers/clients can view their verification status');
        }
        return await verificationService.getOrganizerStatus(user.userId);
      },
      {
        detail: {
          tags: ['Verification'],
          summary: 'Get organizer verification status',
          description: 'Get current verification status for the organizer',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    // ===================================
    // ARTIST VERIFICATION ROUTES
    // ===================================

    /**
     * Submit identity verification (Artist)
     * POST /verification/artist/identity
     */
    .post(
      '/artist/identity',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ARTIST) {
          throw new ForbiddenException('Only artists can submit identity verification');
        }
        const context = ctx as RouteContext;
        const body = context.body as SubmitArtistIdentityDto;
        return await verificationService.submitArtistIdentity(user.userId, body);
      },
      {
        body: SubmitArtistIdentitySchema,
        detail: {
          tags: ['Verification'],
          summary: 'Submit identity verification (Artist)',
          description: 'Submit identity documents for KYC verification',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Submit bank account verification (Artist)
     * POST /verification/artist/bank
     */
    .post(
      '/artist/bank',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ARTIST) {
          throw new ForbiddenException('Only artists can submit bank verification');
        }
        const context = ctx as RouteContext;
        const body = context.body as SubmitBankAccountDto;
        return await verificationService.submitBankAccount(user.userId, body);
      },
      {
        body: SubmitBankAccountSchema,
        detail: {
          tags: ['Verification'],
          summary: 'Submit bank account verification (Artist)',
          description: 'Submit bank account details for payment',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get artist verification status
     * GET /verification/artist/status
     */
    .get(
      '/artist/status',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ARTIST) {
          throw new ForbiddenException('Only artists can view their verification status');
        }
        return await verificationService.getArtistStatus(user.userId);
      },
      {
        detail: {
          tags: ['Verification'],
          summary: 'Get artist verification status',
          description: 'Get current verification status for the artist',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    // ===================================
    // ADMIN ROUTES
    // ===================================

    /**
     * List all verifications (Admin)
     * GET /verification/admin/list
     */
    .get(
      '/admin/list',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Admin access required');
        }
        const context = ctx as RouteContext;
        const query = context.query;
        return await verificationService.listVerifications({
          type: query.type as 'organizer' | 'artist' | undefined,
          status: query.status as VerificationStatus | undefined,
          page: query.page ? parseInt(query.page) : 1,
          limit: query.limit ? parseInt(query.limit) : 20,
        });
      },
      {
        query: t.Object({
          type: t.Optional(t.Union([t.Literal('organizer'), t.Literal('artist')])),
          status: t.Optional(t.String()),
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
        detail: {
          tags: ['Verification', 'Admin'],
          summary: 'List all verifications (Admin)',
          description: 'List all pending and processed verifications',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get verification details (Admin)
     * GET /verification/admin/:id/:type
     */
    .get(
      '/admin/:id/:type',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Admin access required');
        }
        const context = ctx as RouteContext;
        const { id, type } = context.params;
        validateObjectId(id, 'verificationId');
        return await verificationService.getVerificationDetails(
          id,
          type as 'organizer' | 'artist'
        );
      },
      {
        params: t.Object({
          id: t.String(),
          type: t.Union([t.Literal('organizer'), t.Literal('artist')]),
        }),
        detail: {
          tags: ['Verification', 'Admin'],
          summary: 'Get verification details (Admin)',
          description: 'Get detailed verification information',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Approve verification section (Admin)
     * POST /verification/admin/approve
     */
    .post(
      '/admin/approve',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Admin access required');
        }
        const context = ctx as RouteContext;
        const body = context.body as AdminApproveVerificationDto;
        return await verificationService.approveVerification(user.userId, body);
      },
      {
        body: AdminApproveVerificationSchema,
        detail: {
          tags: ['Verification', 'Admin'],
          summary: 'Approve verification section (Admin)',
          description: 'Approve a specific section of verification',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Reject verification section (Admin)
     * POST /verification/admin/reject
     */
    .post(
      '/admin/reject',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Admin access required');
        }
        const context = ctx as RouteContext;
        const body = context.body as AdminRejectVerificationDto;
        return await verificationService.rejectVerification(user.userId, body);
      },
      {
        body: AdminRejectVerificationSchema,
        detail: {
          tags: ['Verification', 'Admin'],
          summary: 'Reject verification section (Admin)',
          description: 'Reject a specific section of verification with reason',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Update professional verification (Admin)
     * POST /verification/admin/professional
     */
    .post(
      '/admin/professional',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Admin access required');
        }
        const context = ctx as RouteContext;
        const body = context.body as AdminUpdateProfessionalDto;
        return await verificationService.updateProfessional(user.userId, body);
      },
      {
        body: AdminUpdateProfessionalSchema,
        detail: {
          tags: ['Verification', 'Admin'],
          summary: 'Update professional verification (Admin)',
          description: 'Update professional verification status for an artist',
          security: [{ BearerAuth: [] }],
        },
      }
    );
