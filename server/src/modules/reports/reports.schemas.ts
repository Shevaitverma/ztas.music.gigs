import { t } from 'elysia';
import { ReportType, ReportCategory, ReportStatus } from '../../shared/enums';

/**
 * Reported Entity Schema
 */
const ReportedEntitySchema = t.Object({
  entityType: t.Union([
    t.Literal('USER'),
    t.Literal('GIG'),
    t.Literal('REVIEW'),
    t.Literal('BID'),
    t.Literal('APPLICATION'),
  ]),
  entityId: t.String({ minLength: 24, maxLength: 24, pattern: '^[a-fA-F0-9]{24}$' }),
});

/**
 * Create Report Schema
 */
export const CreateReportSchema = t.Object({
  /** What is being reported */
  reported: ReportedEntitySchema,
  /** Category of the report */
  category: t.Enum(ReportCategory),
  /** Type/severity of the issue */
  type: t.Enum(ReportType),
  /** Detailed description of the issue */
  description: t.String({ minLength: 20, maxLength: 2000 }),
  /** Supporting evidence (URLs to screenshots, etc.) */
  evidence: t.Optional(t.Array(t.String(), { maxItems: 5 })),
});

/**
 * Update Report Schema (for adding info)
 */
export const UpdateReportSchema = t.Object({
  /** Additional description */
  description: t.Optional(t.String({ minLength: 20, maxLength: 2000 })),
  /** Additional evidence */
  evidence: t.Optional(t.Array(t.String(), { maxItems: 5 })),
});

/**
 * Admin Update Report Schema
 */
export const AdminUpdateReportSchema = t.Object({
  /** New status */
  status: t.Optional(t.Enum(ReportStatus)),
  /** Priority level */
  priority: t.Optional(t.Union([
    t.Literal('LOW'),
    t.Literal('MEDIUM'),
    t.Literal('HIGH'),
    t.Literal('CRITICAL'),
  ])),
  /** Assign to admin (user ID — 24-char hex ObjectId) */
  assignedTo: t.Optional(
    t.String({ minLength: 24, maxLength: 24, pattern: '^[a-fA-F0-9]{24}$' })
  ),
  /** Internal notes */
  adminNotes: t.Optional(t.String({ maxLength: 2000 })),
});

/**
 * Resolve Report Schema
 */
export const ResolveReportSchema = t.Object({
  /** Action taken */
  action: t.Union([
    t.Literal('NO_ACTION'),
    t.Literal('WARNING'),
    t.Literal('CONTENT_REMOVED'),
    t.Literal('USER_SUSPENDED'),
    t.Literal('USER_BANNED'),
  ]),
  /** Resolution notes */
  notes: t.String({ minLength: 10, maxLength: 2000 }),
});

/**
 * Search Reports Query Schema
 */
export const SearchReportsSchema = t.Object({
  /** Filter by category */
  category: t.Optional(t.String()),
  /** Filter by type */
  type: t.Optional(t.String()),
  /** Filter by status */
  status: t.Optional(t.String()),
  /** Filter by priority */
  priority: t.Optional(t.String()),
  /** Filter by assigned admin */
  assignedTo: t.Optional(t.String()),
  /** Filter by reporter */
  reporter: t.Optional(t.String()),
  /** Filter by reported entity type */
  entityType: t.Optional(t.String()),
  /** Filter by reported entity ID */
  entityId: t.Optional(t.String()),
  /** Sort field */
  sortBy: t.Optional(t.String({ default: 'createdAt' })),
  /** Sort order */
  sortOrder: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')])),
  /** Pagination */
  page: t.Optional(t.Numeric({ default: 1 })),
  limit: t.Optional(t.Numeric({ default: 20 })),
});

// Type exports
export type CreateReportDto = typeof CreateReportSchema.static;
export type UpdateReportDto = typeof UpdateReportSchema.static;
export type AdminUpdateReportDto = typeof AdminUpdateReportSchema.static;
export type ResolveReportDto = typeof ResolveReportSchema.static;
export type SearchReportsDto = typeof SearchReportsSchema.static;
