/**
 * Utility Function Tests
 */
import { describe, it, expect } from 'bun:test';
import { paginate, createPaginatedResponse, parsePaginationQuery } from '../shared/utils/pagination.utils';
import { successResponse, errorResponse, HTTP_STATUS } from '../shared/utils/response.utils';

describe('Pagination Utils', () => {
  describe('paginate', () => {
    it('should return default values when no params provided', () => {
      const result = paginate({});
      
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.skip).toBe(0);
    });

    it('should calculate skip correctly', () => {
      const result = paginate({ page: 3, limit: 10 });
      
      expect(result.skip).toBe(20);
    });

    it('should cap limit at MAX_LIMIT', () => {
      const result = paginate({ limit: 1000 });
      
      expect(result.limit).toBe(100); // MAX_LIMIT
    });

    it('should ensure page is at least 1', () => {
      const result = paginate({ page: -5 });
      
      expect(result.page).toBe(1);
    });
  });

  describe('createPaginatedResponse', () => {
    it('should create proper pagination metadata', () => {
      const result = createPaginatedResponse(['item1', 'item2'], 25, 2, 10);
      
      expect(result.data).toEqual(['item1', 'item2']);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(true);
    });
  });
});

describe('Response Utils', () => {
  describe('successResponse', () => {
    it('should create success response with data', () => {
      const result = successResponse({ id: '123' }, 'User created');
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('User created');
      expect(result.data).toEqual({ id: '123' });
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('errorResponse', () => {
    it('should create error response', () => {
      const result = errorResponse('Not found', 404, 'Not Found');
      
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(404);
    });
  });

  describe('HTTP_STATUS', () => {
    it('should have standard HTTP status codes', () => {
      expect(HTTP_STATUS.OK.code).toBe(200);
      expect(HTTP_STATUS.NOT_FOUND.code).toBe(404);
    });
  });
});
