import { t } from 'elysia';
import { ApplicationStatus } from '../../shared/enums';

/**
 * MongoDB ObjectId validation pattern
 */
const OBJECT_ID_PATTERN = '^[a-fA-F0-9]{24}$';

/**
 * Create Application Schema
 */
export const CreateApplicationSchema = t.Object({
  gigId: t.String({
    minLength: 24,
    maxLength: 24,
    pattern: OBJECT_ID_PATTERN,
    description: 'MongoDB ObjectId of the gig to apply to',
  }),
  proposal: t.String({
    minLength: 20,
    maxLength: 2000,
    description: 'Your proposal/pitch for the gig',
  }),
  bidAmount: t.Number({
    minimum: 0,
    description: 'Your quoted price for the gig',
  }),
});

/**
 * Update Application Status Schema
 */
export const UpdateApplicationStatusSchema = t.Object({
  status: t.Enum(ApplicationStatus, {
    description: 'New status (ACCEPTED, REJECTED, or WITHDRAWN)',
  }),
});

// Type exports
export type CreateApplicationDto = typeof CreateApplicationSchema.static;
export type UpdateApplicationStatusDto = typeof UpdateApplicationStatusSchema.static;
