import { z } from 'zod'

export const gigCategorySchema = z.enum([
  'SOLO_VOCALIST',
  'LIVE_BAND',
  'DJ',
  'ACOUSTIC',
  'CLASSICAL',
  'JAZZ',
  'ELECTRONIC',
  'TRADITIONAL',
  'COVER_BAND',
  'ORIGINAL_ARTIST',
])

export const budgetSchema = z
  .object({
    min: z.number().int().nonnegative('Min budget must be 0 or greater'),
    max: z.number().int().positive('Max budget must be greater than 0'),
    currency: z.string().min(1).default('INR'),
  })
  .refine((b) => b.max >= b.min, {
    message: 'Max budget must be ≥ min budget',
    path: ['max'],
  })

export const venueSchema = z.object({
  name: z.string().trim().min(1, 'Venue name is required'),
  address: z.string().trim().default(''),
  city: z.string().trim().min(1, 'City is required'),
  coordinates: z
    .object({ lat: z.number(), lng: z.number() })
    .optional(),
})

export const eventTimingSchema = z.object({
  date: z.string().min(1, 'Event date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
})

export const createGigSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, 'Title must be at least 5 characters')
    .max(120, 'Title must be 120 characters or fewer'),
  description: z
    .string()
    .trim()
    .min(20, 'Description must be at least 20 characters')
    .max(2000, 'Description must be 2000 characters or fewer'),
  category: gigCategorySchema,
  budget: budgetSchema,
  venue: venueSchema,
  eventTiming: eventTimingSchema,
  requirements: z.string().max(2000).optional(),
})

export type CreateGigSchemaInput = z.infer<typeof createGigSchema>
