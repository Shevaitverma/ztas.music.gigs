/**
 * Standard API Response Interface
 */
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  timestamp: string;
  requestId?: string;
}

/**
 * Error Response Interface
 */
export interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path?: string;
  requestId?: string;
}

/**
 * Create a success response
 */
export function successResponse<T>(
  data: T,
  message = 'Success'
): ApiResponse<T> {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an error response
 */
export function errorResponse(
  message: string,
  statusCode: number = 500,
  error: string = 'Error'
): ErrorResponse {
  return {
    success: false,
    error,
    message,
    statusCode,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a validation error response
 */
export function validationErrorResponse(
  errors: Array<{ field: string; message: string }>
): ErrorResponse & { errors: typeof errors } {
  return {
    success: false,
    error: 'Validation Error',
    message: 'Request validation failed',
    statusCode: 400,
    timestamp: new Date().toISOString(),
    errors,
  };
}

/**
 * HTTP Status codes with messages
 */
export const HTTP_STATUS = {
  OK: { code: 200, message: 'OK' },
  CREATED: { code: 201, message: 'Created' },
  NO_CONTENT: { code: 204, message: 'No Content' },
  BAD_REQUEST: { code: 400, message: 'Bad Request' },
  UNAUTHORIZED: { code: 401, message: 'Unauthorized' },
  FORBIDDEN: { code: 403, message: 'Forbidden' },
  NOT_FOUND: { code: 404, message: 'Not Found' },
  CONFLICT: { code: 409, message: 'Conflict' },
  UNPROCESSABLE_ENTITY: { code: 422, message: 'Unprocessable Entity' },
  TOO_MANY_REQUESTS: { code: 429, message: 'Too Many Requests' },
  INTERNAL_SERVER_ERROR: { code: 500, message: 'Internal Server Error' },
  SERVICE_UNAVAILABLE: { code: 503, message: 'Service Unavailable' },
} as const;
