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

// REMOVED: Unused utility functions
// - safeArrayAccess: never imported
// - safeFirst: never imported (was only used by safeArrayAccess)
// - safeEmail: never imported
// - safeTruncate: never imported
// - safeCurrency: never imported
// - safeJSONParse: never imported
//
// ACTIVE FUNCTIONS (keep these):
// - safeString
// - safeNumber
// - safeDate
// - safeISODate