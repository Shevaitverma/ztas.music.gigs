import { PAGINATION } from '../constants';

/**
 * Pagination Parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/**
 * Pagination Metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Paginated Result
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Calculate skip and limit for pagination
 */
export function paginate(params: PaginationParams): { skip: number; limit: number; page: number } {
  const page = Math.max(1, params.page ?? PAGINATION.DEFAULT_PAGE);
  const limit = Math.min(
    PAGINATION.MAX_LIMIT,
    Math.max(1, params.limit ?? PAGINATION.DEFAULT_LIMIT)
  );

  return {
    skip: (page - 1) * limit,
    limit,
    page,
  };
}

/**
 * Create a paginated response
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Parse pagination params from query string
 * Handles string to number conversion safely
 */
export function parsePaginationQuery(query: {
  page?: string;
  limit?: string;
}): PaginationParams {
  return {
    page: query.page ? parseInt(query.page, 10) || PAGINATION.DEFAULT_PAGE : undefined,
    limit: query.limit ? parseInt(query.limit, 10) || PAGINATION.DEFAULT_LIMIT : undefined,
  };
}
