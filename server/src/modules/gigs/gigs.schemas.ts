import { t } from 'elysia';
import { GigCategory, GigStatus, MusicGenre } from '../../shared/enums';

/**
 * MongoDB ObjectId validation pattern
 */
const OBJECT_ID_PATTERN = '^[a-fA-F0-9]{24}$';

/**
 * Coordinates Schema with proper bounds validation
 */
const CoordinatesSchema = t.Object({
  lat: t.Number({ minimum: -90, maximum: 90, description: 'Latitude (-90 to 90)' }),
  lng: t.Number({ minimum: -180, maximum: 180, description: 'Longitude (-180 to 180)' }),
});

/**
 * Budget Range Schema with cross-validation note
 * Note: min <= max validation is done in service layer
 */
const BudgetRangeSchema = t.Object({
  min: t.Number({ minimum: 0, description: 'Minimum budget (must be <= max)' }),
  max: t.Number({ minimum: 0, description: 'Maximum budget (must be >= min)' }),
  currency: t.Optional(t.String({ default: 'INR', minLength: 3, maxLength: 3 })),
});

/**
 * Venue Location Schema
 */
const VenueLocationSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 200, description: 'Venue name' }),
  address: t.String({ minLength: 5, maxLength: 500, description: 'Full address' }),
  city: t.String({ minLength: 2, maxLength: 100, description: 'City name' }),
  state: t.Optional(t.String({ maxLength: 100 })),
  pincode: t.Optional(t.String({ pattern: '^[0-9]{5,10}$', description: 'Postal code' })),
  coordinates: t.Optional(CoordinatesSchema),
});

/**
 * Event Timing Schema
 * Note: endTime > startTime and date in future validation is done in service layer.
 * Set overnightAllowed=true for events that legitimately cross midnight.
 */
const EventTimingSchema = t.Object({
  date: t.String({ format: 'date-time', description: 'Event date (ISO 8601 format)' }),
  startTime: t.String({
    pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
    description: 'Start time in HH:mm format (24-hour)'
  }),
  endTime: t.String({
    pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
    description: 'End time in HH:mm format (24-hour)'
  }),
  overnightAllowed: t.Optional(
    t.Boolean({
      default: false,
      description:
        'Set true when endTime is earlier than startTime (event crosses midnight).',
    })
  ),
});

/**
 * Create Gig Schema
 */
export const CreateGigSchema = t.Object({
  title: t.String({ minLength: 5, maxLength: 200, description: 'Gig title' }),
  description: t.String({ minLength: 20, maxLength: 2000, description: 'Detailed description' }),
  category: t.Enum(GigCategory, { description: 'Gig category' }),
  budget: BudgetRangeSchema,
  venue: VenueLocationSchema,
  eventTiming: EventTimingSchema,
  images: t.Optional(t.Array(t.String({ format: 'uri' }), { maxItems: 5 })),
  requirements: t.Optional(t.String({ maxLength: 1000 })),
  equipmentProvided: t.Optional(t.Array(t.String({ maxLength: 100 }), { maxItems: 20 })),
  preferredGenres: t.Optional(t.Array(t.Enum(MusicGenre), { maxItems: 10 })),
});

/**
 * Update Gig Schema
 */
export const UpdateGigSchema = t.Object({
  title: t.Optional(t.String({ minLength: 5, maxLength: 200 })),
  description: t.Optional(t.String({ minLength: 20, maxLength: 2000 })),
  category: t.Optional(t.Enum(GigCategory)),
  budget: t.Optional(BudgetRangeSchema),
  venue: t.Optional(VenueLocationSchema),
  eventTiming: t.Optional(EventTimingSchema),
  images: t.Optional(t.Array(t.String(), { maxItems: 5 })),
  status: t.Optional(t.Enum(GigStatus)),
  requirements: t.Optional(t.String({ maxLength: 1000 })),
  equipmentProvided: t.Optional(t.Array(t.String())),
  preferredGenres: t.Optional(t.Array(t.String())),
});

/**
 * Search Gigs Schema
 */
export const SearchGigsSchema = t.Object({
  query: t.Optional(t.String()),
  city: t.Optional(t.String()),
  category: t.Optional(t.Enum(GigCategory)),
  status: t.Optional(t.Enum(GigStatus)),
  minBudget: t.Optional(t.Numeric()),
  maxBudget: t.Optional(t.Numeric()),
  date: t.Optional(t.String()),
  lat: t.Optional(t.Numeric()),
  lng: t.Optional(t.Numeric()),
  distance: t.Optional(t.Numeric({ default: 50000 })), // meters
  page: t.Optional(t.Numeric({ default: 1 })),
  limit: t.Optional(t.Numeric({ default: 20 })),
  postedBy: t.Optional(t.String()), // Find gigs by a specific client
});
