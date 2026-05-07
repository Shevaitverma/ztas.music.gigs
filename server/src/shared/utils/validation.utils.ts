/**
 * Validation Utilities
 */

import { BadRequestException } from '../../plugins/error.plugin';

/**
 * Escape special regex characters to prevent ReDoS attacks
 * @param str - String to escape
 * @returns Escaped string safe for use in regex
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate that a value is a valid enum member
 * @param value - Value to validate
 * @param enumObj - Enum object to check against
 * @param fieldName - Field name for error message
 * @returns The validated value or undefined
 * @throws BadRequestException if value is invalid
 */
export function validateEnum<T extends Record<string, string>>(
  value: string | undefined,
  enumObj: T,
  fieldName: string
): T[keyof T] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const validValues = Object.values(enumObj);
  if (validValues.includes(value as T[keyof T])) {
    return value as T[keyof T];
  }

  throw new BadRequestException(
    `Invalid ${fieldName}: "${value}". Valid values are: ${validValues.join(', ')}`
  );
}

/**
 * Validate and parse a positive integer from a query/string input. Strict:
 * unparsable / negative / non-integer / trailing-junk values throw a 400
 * BadRequestException rather than silently falling back to the default.
 *
 * Empty (undefined/null/'') still returns the default — pagination params are
 * frequently omitted and that case is benign.
 *
 * @param value - Raw value (typically `query.page` / `query.limit`)
 * @param defaultValue - Used only when value is undefined / null / ''
 * @param max - Optional ceiling; values above this are clamped (NOT rejected)
 * @param name - Param name surfaced in the error message
 */
export function parsePositiveInt(
  value: string | number | undefined | null,
  defaultValue: number,
  max?: number,
  name: string = 'value'
): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  // Numeric inputs: validate they're integers and positive without re-stringifying.
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 1) {
      throw new BadRequestException(
        `Invalid pagination parameter '${name}': expected positive integer`
      );
    }
    return max !== undefined ? Math.min(value, max) : value;
  }

  const trimmed = String(value).trim();
  const parsed = Number.parseInt(trimmed, 10);

  // Reject NaN, non-positive, or trailing junk like "5abc" / "5.5" / "+5".
  if (Number.isNaN(parsed) || parsed < 1 || parsed.toString() !== trimmed) {
    throw new BadRequestException(
      `Invalid pagination parameter '${name}': expected positive integer`
    );
  }

  return max !== undefined ? Math.min(parsed, max) : parsed;
}

/**
 * Validate MongoDB ObjectId format
 * @param id - ID to validate
 * @param fieldName - Field name for error message
 * @throws BadRequestException if invalid
 */
export function validateObjectId(id: string, fieldName: string = 'id'): void {
  const objectIdRegex = /^[a-fA-F0-9]{24}$/;
  if (!objectIdRegex.test(id)) {
    throw new BadRequestException(`Invalid ${fieldName} format`);
  }
}
