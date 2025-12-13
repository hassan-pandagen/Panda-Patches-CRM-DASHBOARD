// src/utils/dataSafety.ts

/**
 * =============================================================================
 * DATA SAFETY UTILITIES
 * =============================================================================
 * Purpose: Prevent crashes when displaying/processing potentially null/undefined data.
 * 
 * USAGE GUIDELINES:
 * - ✅ USE for: Display logic, external API responses, database results
 * - ❌ DON'T USE for: Form validation (fix the root cause instead)
 * - ❌ DON'T USE to: Hide bugs (undefined status = bug, not sanitization issue)
 */

/**
 * Safely converts any value to a string. 
 * Returns defaultValue if input is null/undefined.
 */
export const safeString = (value: any, defaultValue = ''): string => {
  if (value === null || value === undefined) return defaultValue;
  return String(value);
};

/**
 * Safely converts any value to a number.
 * Returns defaultValue if input is invalid/NaN.
 */
export const safeNumber = (value: any, defaultValue = 0): number => {
  if (value === null || value === undefined) return defaultValue;
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
};

/**
 * Safely formats a date string.
 * Returns fallback if date is invalid.
 */
export const safeDate = (dateString: any, fallback = 'N/A'): string => {
  if (!dateString) return fallback;
  const date = new Date(dateString);
  
  // Check if date is valid
  if (isNaN(date.getTime())) return fallback;
  
  return date.toLocaleDateString();
};

/**
 * Safely formats a date to ISO string.
 * Returns null if date is invalid (for database operations).
 */
export const safeISODate = (dateString: any): string | null => {
  if (!dateString) return null;
  const date = new Date(dateString);
  
  if (isNaN(date.getTime())) return null;
  
  return date.toISOString();
};

/**
 * Safely access array index.
 * Returns null if array is invalid or index doesn't exist.
 */
export const safeArrayAccess = <T>(
  array: T[] | null | undefined, 
  index: number
): T | null => {
  if (!Array.isArray(array)) return null;
  if (index < 0 || index >= array.length) return null;
  return array[index];
};

/**
 * Safely get first element of array.
 */
export const safeFirst = <T>(array: T[] | null | undefined): T | null => {
  return safeArrayAccess(array, 0);
};

/**
 * Ensure a value is a valid email or return empty string.
 */
export const safeEmail = (value: any): string => {
  const str = safeString(value);
  // Basic email validation
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str) ? str : '';
};

/**
 * Truncate text safely with ellipsis.
 */
export const safeTruncate = (
  value: any, 
  maxLength: number, 
  ellipsis = '...'
): string => {
  const str = safeString(value);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - ellipsis.length) + ellipsis;
};

/**
 * Format currency safely.
 */
export const safeCurrency = (
  value: any, 
  currency = 'USD', 
  locale = 'en-US'
): string => {
  const num = safeNumber(value);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(num);
};

/**
 * Parse JSON safely - returns null on error instead of throwing.
 */
export const safeJSONParse = <T = any>(jsonString: any): T | null => {
  try {
    return JSON.parse(safeString(jsonString));
  } catch {
    return null;
  }
};