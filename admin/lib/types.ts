// User Types
export type UserRole = 'artist' | 'client' | 'admin'

export type AdminRole = 'SUPER_ADMIN' | 'MODERATOR' | 'VERIFIER' | 'ANALYST'

export interface User {
  id: string
  firebaseUid: string
  email?: string
  phone?: string
  phoneNumber?: string
  name: string
  role: UserRole
  adminRole?: AdminRole
  profilePicture?: string
  isVerified: boolean
  createdAt: string
  updatedAt: string
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  timestamp?: string
}

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export interface PaginatedData<T> {
  data: T[]
  meta: PaginationMeta
}

export interface ApiError {
  success: false
  message?: string
  error?:
    | string
    | {
        code: string
        message: string
        details?: Record<string, unknown>
      }
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: User
}

// Admin domain types (skeletal — flesh out as endpoints solidify)
export interface VerificationRequest {
  id: string
  userId: string
  user?: Pick<User, 'id' | 'name' | 'email' | 'phone'>
  type: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  submittedAt: string
}

export interface Report {
  id: string
  reporterId: string
  targetType: string
  targetId: string
  reason: string
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED'
  createdAt: string
}

// --- verifications ---
export type VerificationStatus =
  | 'pending'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'expired'

export interface VerificationSectionState {
  status: VerificationStatus
  submittedAt?: string
  verifiedAt?: string
  rejectionReason?: string
}

export interface VerificationIdentitySection extends VerificationSectionState {
  numberMasked?: string
  documentUrl?: string
  selfieUrl?: string
}

export interface VerificationBusinessSection extends VerificationSectionState {
  panMasked?: string
  gstMasked?: string
  registrationDocUrl?: string
  name?: string
}

export interface VerificationBankSection extends VerificationSectionState {
  accountNumberMasked?: string
  ifscMasked?: string
  proofDocUrl?: string
  bankName?: string
  accountHolderName?: string
}

export interface VerificationProfessionalSection {
  status: VerificationStatus
  portfolioReviewed: boolean
  videoLinksVerified: boolean
  audioSamplesVerified: boolean
  verifiedAt?: string
  notes?: string
}

export interface VerificationVenue {
  id: string
  name: string
  city: string
  status: VerificationStatus
  verifiedAt?: string
  rejectionReason?: string
  proofDocUrl?: string
}

interface VerificationCommonFields {
  id: string
  userId: string
  user?: Pick<User, 'id' | 'name' | 'email' | 'phone' | 'role' | 'profilePicture'>
  overallStatus: VerificationStatus
  identity?: VerificationIdentitySection
  createdAt: string
  updatedAt: string
}

/**
 * Discriminated union — branch on `kind` to access type-specific fields.
 * Mirrors server's VerificationStatusResponse.
 */
export interface ArtistVerification extends VerificationCommonFields {
  kind: 'artist'
  type: 'artist'
  bankAccount?: VerificationBankSection
  professional?: VerificationProfessionalSection
}

export interface OrganizerVerification extends VerificationCommonFields {
  kind: 'organizer'
  type: 'organizer'
  business?: VerificationBusinessSection
  venues?: VerificationVenue[]
}

export type VerificationDetail = ArtistVerification | OrganizerVerification

/** Same shape returned by /verification/admin/list — list rows are full detail objects. */
export type VerificationListItem = VerificationDetail
// --- /verifications ---

// --- users-moderation ---
/** UserStatus enum mirroring server `shared/enums.UserStatus`. */
export type UserStatus = 'active' | 'inactive' | 'banned' | 'suspended' | 'pending'

/** Status values the admin UI is allowed to set via the status endpoint. */
export type AssignableUserStatus = 'active' | 'suspended' | 'banned'

/** Listing row returned by GET /admin/users. */
export interface UserListItem {
  id: string
  name?: string
  email?: string
  phoneNumber?: string
  role: UserRole
  status: UserStatus
  isVerified: boolean
  profilePicture?: string
  createdAt: string
  updatedAt: string
}

/** Full user detail. List endpoint is the only documented user fetch surface,
 * so detail view reuses it client-side; profile sub-objects are optional and
 * surfaced when present. */
export interface UserDetail extends UserListItem {
  statusReason?: string
  joinedAt?: string
  lastLogin?: string
  artistProfile?: {
    stageName?: string
    bio?: string
    yearsOfExperience?: number
    baseRate?: number
    location?: { city?: string; state?: string; country?: string }
    genres?: string[]
    instruments?: string[]
    languages?: string[]
    performanceTypes?: string[]
  }
  clientProfile?: {
    company?: string
    industry?: string
    location?: { city?: string; state?: string; country?: string }
  }
}

/** Server pagination envelope used by /admin/users. */
export interface ServerPagination {
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface UsersListResponse {
  data: UserListItem[]
  pagination: ServerPagination
}

export interface UserListFilters {
  page?: number
  limit?: number
  role?: UserRole
  status?: UserStatus
  isVerified?: boolean
  search?: string
}

/** Activity log entry shape returned by /admin/activity-logs/user/:userId. */
export interface ActivityLogEntry {
  id?: string
  _id?: string
  userId?: string
  action: string
  category: string
  targetType?: string
  targetId?: string
  description?: string
  metadata?: Record<string, unknown>
  createdAt: string
}
// --- end users-moderation ---

// --- reports-moderation ---
// Types matching the server's `ReportResponse` DTO from
// `ai.zts.music.server/src/modules/reports/reports.service.ts`. Enum string
// unions are inlined rather than imported so this block stays append-only.

export type AdminReportStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'NEEDS_INFO'
  | 'INVESTIGATING'
  | 'RESOLVED'
  | 'DISMISSED'
  | 'ESCALATED'

export type AdminReportCategory =
  | 'USER_BEHAVIOR'
  | 'GIG_CONTENT'
  | 'PAYMENT'
  | 'PROFILE_CONTENT'
  | 'SAFETY'
  | 'SPAM'
  | 'TECHNICAL'
  | 'OTHER'

export type AdminReportType =
  | 'HARASSMENT'
  | 'FRAUD'
  | 'SCAM'
  | 'IMPERSONATION'
  | 'INAPPROPRIATE_CONTENT'
  | 'ILLEGAL_CONTENT'
  | 'NO_SHOW'
  | 'LATE_ARRIVAL'
  | 'UNPROFESSIONAL_BEHAVIOR'
  | 'QUALITY_MISMATCH'
  | 'FALSE_INFORMATION'
  | 'PAYMENT_DISPUTE'
  | 'SAFETY_CONCERN'
  | 'COPYRIGHT'
  | 'SPAM'
  | 'BUG'
  | 'OTHER'

export type AdminReportPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type AdminReportEntityType = 'USER' | 'GIG' | 'REVIEW' | 'BID' | 'APPLICATION'

export type AdminReportResolutionAction =
  | 'NO_ACTION'
  | 'WARNING'
  | 'CONTENT_REMOVED'
  | 'USER_SUSPENDED'
  | 'USER_BANNED'

export interface AdminReportReporter {
  id: string
  name?: string
  profilePicture?: string
}

export interface AdminReportAssignee {
  id: string
  name?: string
}

export interface AdminReportResolution {
  action: AdminReportResolutionAction
  notes: string
  resolvedBy: string
  resolvedAt: string
}

export interface AdminReportTarget {
  entityType: AdminReportEntityType
  entityId: string
}

export interface AdminReport {
  id: string
  reporter: AdminReportReporter
  reported: AdminReportTarget
  category: AdminReportCategory
  type: AdminReportType
  description: string
  evidence: string[]
  status: AdminReportStatus
  priority: AdminReportPriority
  assignedTo?: AdminReportAssignee
  resolution?: AdminReportResolution
  adminNotes?: string
  createdAt: string
  updatedAt: string
}

export interface AdminReportListFilters {
  status?: AdminReportStatus
  type?: AdminReportType
  category?: AdminReportCategory
  priority?: AdminReportPriority
  entityType?: AdminReportEntityType
  entityId?: string
  reporter?: string
  assignedTo?: string
}
// --- /reports-moderation ---
