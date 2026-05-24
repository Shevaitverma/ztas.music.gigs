import { t } from 'elysia';

/**
 * Venue Params Schema
 */
const VenueParamsSchema = t.Object({
  capacity: t.Optional(t.Number({ minimum: 0 })),
  hasSoundSystem: t.Optional(t.Boolean()),
  hasStage: t.Optional(t.Boolean()),
  hasLighting: t.Optional(t.Boolean()),
});

/**
 * Coordinate Schema
 */
const CoordinateSchema = t.Object({
  lat: t.Number(),
  lng: t.Number(),
});

/**
 * Create Venue Schema
 */
export const CreateVenueSchema = t.Object({
  name: t.String({ minLength: 2 }),
  address: t.String(),
  city: t.String(),
  state: t.Optional(t.String()),
  pincode: t.Optional(t.String()),
  coordinates: t.Optional(CoordinateSchema),
  params: t.Optional(VenueParamsSchema),
});

/**
 * Update Venue Schema
 */
export const UpdateVenueSchema = t.Object({
  name: t.Optional(t.String({ minLength: 2 })),
  address: t.Optional(t.String()),
  city: t.Optional(t.String()),
  state: t.Optional(t.String()),
  pincode: t.Optional(t.String()),
  coordinates: t.Optional(CoordinateSchema),
  params: t.Optional(VenueParamsSchema),
});

// Type exports
export type CreateVenueDto = typeof CreateVenueSchema.static;
export type UpdateVenueDto = typeof UpdateVenueSchema.static;
