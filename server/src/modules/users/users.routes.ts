import { Elysia, t } from 'elysia';
import { UsersService } from './users.service';
import type { UpdateProfileDto, ArtistProfileResponse } from './users.service';
import { getAuthUser, type RouteContext } from '../../shared/types/auth.types';
import { UpdateProfileSchema } from './users.schemas';
import { transformPlugin } from '../../plugins/transform.plugin';
import { validateObjectId } from '../../shared/utils/validation.utils';

/**
 * Users Routes
 */
export const usersRoutes = (usersService: UsersService) =>
  new Elysia({ prefix: '/users' })
    .use(transformPlugin)
    /**
     * Get Current User Profile (Protected)
     */
    .get(
      '/me',
      async (ctx) => {
        const user = getAuthUser(ctx);
        return await usersService.getProfile(user.userId);
      },
      {
        detail: {
          tags: ['Users'],
          summary: 'Get current user profile',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Update Basic Info (Protected) - MUST MATCH NESTJS: PUT /users/me
     */
    .put(
      '/me',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        return await usersService.updateProfile(user.userId, context.body as UpdateProfileDto);
      },
      {
        body: UpdateProfileSchema,
        detail: {
          tags: ['Users'],
          summary: 'Update basic user info',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get Artist Profile (Protected) - MUST MATCH NESTJS: GET /users/me/artist-profile
     */
    .get(
      '/me/artist-profile',
      async (ctx) => {
        const user = getAuthUser(ctx);
        // Return artist profile from user
        const profile = await usersService.getProfile(user.userId);
        return profile.artistProfile || null;
      },
      {
        detail: {
          tags: ['Users'],
          summary: 'Get artist profile',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Update Artist Profile (Protected) - MUST MATCH NESTJS: PUT /users/me/artist-profile
     */
    .put(
      '/me/artist-profile',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        // Update artist profile data
        return await usersService.updateProfile(user.userId, {
          artistProfile: context.body as Partial<ArtistProfileResponse>
        });
      },
      {
        body: t.Object({
          stageName: t.Optional(t.String()),
          bio: t.Optional(t.String()),
          genres: t.Optional(t.Array(t.String())),
          performanceTypes: t.Optional(t.Array(t.String())),
          yearsOfExperience: t.Optional(t.Number()),
          baseRate: t.Optional(t.Number()),
          instruments: t.Optional(t.Array(t.String())),
          languages: t.Optional(t.Array(t.String())),
          location: t.Optional(t.Object({
            city: t.Optional(t.String()),
            state: t.Optional(t.String()),
            country: t.Optional(t.String()),
            coordinates: t.Optional(t.Object({
              lat: t.Number(),
              lng: t.Number()
            }))
          })),
          portfolio: t.Optional(t.Object({
            videos: t.Optional(t.Array(t.String())),
            images: t.Optional(t.Array(t.String())),
            audio: t.Optional(t.Array(t.String()))
          })),
          socialLinks: t.Optional(t.Object({
            instagram: t.Optional(t.String()),
            youtube: t.Optional(t.String()),
            spotify: t.Optional(t.String()),
            soundcloud: t.Optional(t.String())
          })),
          onboardingComplete: t.Optional(t.Boolean())
        }),
        detail: {
          tags: ['Users'],
          summary: 'Update artist profile',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Update Artist Location (Protected) - MUST MATCH NESTJS: PATCH /users/me/location
     */
    .patch(
      '/me/location',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { city, state, country, coordinates } = context.body as {
          city?: string;
          state?: string;
          country?: string;
          coordinates?: { lat: number; lng: number };
        };
        return await usersService.updateProfile(user.userId, {
          artistProfile: {
            location: {
              city,
              state,
              country,
              coordinates: coordinates ? {
                lat: coordinates.lat,
                lng: coordinates.lng
              } : undefined
            }
          }
        });
      },
      {
        body: t.Object({
          city: t.Optional(t.String()),
          state: t.Optional(t.String()),
          country: t.Optional(t.String()),
          coordinates: t.Optional(t.Object({
            lat: t.Number(),
            lng: t.Number()
          }))
        }),
        detail: {
          tags: ['Users'],
          summary: 'Update artist location',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Search Artists (Public)
     */
    .get(
      '/artists',
      async ({ query }) => {
        return await usersService.searchArtists({
          query: query.query,
          genre: query.genre,
          performanceType: query.performanceType,
          city: query.city,
          lat: query.lat ? parseFloat(query.lat) : undefined,
          lng: query.lng ? parseFloat(query.lng) : undefined,
          distance: query.distance ? parseFloat(query.distance) : undefined,
          page: query.page ? parseInt(query.page) : 1,
          limit: query.limit ? parseInt(query.limit) : 20,
        });
      },
      {
        query: t.Object({
          query: t.Optional(t.String()),
          genre: t.Optional(t.String()),
          performanceType: t.Optional(t.String()),
          city: t.Optional(t.String()),
          lat: t.Optional(t.String()),
          lng: t.Optional(t.String()),
          distance: t.Optional(t.String()),
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
        detail: {
          tags: ['Users'],
          summary: 'Search artists',
          description: 'Search for artists with filters and geolocation',
        },
      }
    )

    /**
     * Upload Profile Picture (Protected)
     */
    .post(
      '/profile/picture',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { file } = context.body as { file: File };
        const url = await usersService.uploadProfilePicture(user.userId, file);
        return { url };
      },
      {
        body: t.Object({
          file: t.File()
        }),
        detail: {
          tags: ['Users'],
          summary: 'Upload profile picture',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get Public Profile (Public)
     */
    .get(
      '/:id',
      async ({ params: { id } }) => {
        validateObjectId(id, 'userId');
        return await usersService.getPublicProfile(id);
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Users'],
          summary: 'Get public profile',
        },
      }
    );
