// src/services/validation.ts - Centralized input validation using Zod

import { z } from 'zod';
import { logger } from './logger';
import { PATCHES_TYPE_OPTIONS } from '../constants/index';

// ============ ORDER SCHEMAS ============

// ============ CORRECTED ORDER SCHEMA ============
export const orderSchema = z.object({
  // ✅ Required String Fields
  customerName: z.string()
    .min(1, 'Customer Name is required')
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name too long'),
  
  customerEmail: z.string()
    .min(1, 'Email is required')
    .email('Invalid email address'),
  
  // ✅ CRITICAL: Status matches your data (not orderStatus)
  status: z.enum([
    'NEW_ORDER',
    'AWAITING_APPROVAL',
    'REVISION_REQUESTED',
    'APPROVED',
    'IN_PRODUCTION',
    'QUALITY_ASSURANCE',
    'SHIPPED',
    'DELIVERED',
    'FEEDBACK',
    'CANCELLED',
    'REFUNDED'
  ]).default('NEW_ORDER'),
  
  // ✅ Required Numbers with validation
  patchesQuantity: z.number()
    .min(1, 'Quantity must be at least 1'),
  
  orderAmount: z.number()
    .min(0, 'Order amount cannot be negative'),
  
  amountPaid: z.number()
    .min(0, 'Amount paid cannot be negative'),
  
  // ✅ Optional Fields
  customerPhone: z.string().optional().nullable(),
  customerProfileUrl: z.string().url().optional().nullable(),
  
  designName: z.string().optional(),
  patchesType: z.enum(PATCHES_TYPE_OPTIONS as [string, ...string[]]).optional(),
  designSize: z.string().optional(),
  designBacking: z.string().optional(),
  instructions: z.string().optional(),
  
  shippingAddress: z.string().optional(),
  shippingCarrier: z.string().optional(),
  shippingTrackingNumber: z.string().optional(),
  
  productionCost: z.number().min(0).optional(),
  shippingCost: z.number().min(0).optional(),
  marketingCost: z.number().min(0).optional(),
  
  isUrgent: z.boolean().optional(),
  leadSource: z.string().optional(),
  
  // ✅ Array Fields
  mockupUrls: z.array(z.string()).optional(),
  productionFileUrls: z.array(z.string()).optional(),
  shippingAttachmentUrls: z.array(z.string()).optional(),
  customerAttachmentUrls: z.array(z.string()).optional(),
  
  // ✅ Reason Fields
  reasonCategory: z.string().optional(),
  reasonDetails: z.string().optional(),
  
  revisionNotes: z.string().optional(),
  redoNotes: z.string().optional(),
}).partial();  // Flexible for partial updates

// ============ USER SCHEMAS ============

export const userSchema = z.object({
  email: z.string().email('Invalid email address'),
  fullName: z.string().min(2, 'Name required'),
  role: z.enum(['ADMIN', 'USER', 'PRODUCTION', 'AGENT']).optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[0-9]/, 'Must contain number'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// ============ SEARCH/FILTER SCHEMAS ============

export const searchSchema = z.object({
  query: z.string().min(1, 'Search query required'),
  limit: z.number().int().positive().optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// ============ TYPE EXPORTS ============

export type Order = z.infer<typeof orderSchema>;
export type User = z.infer<typeof userSchema>;
export type PasswordChange = z.infer<typeof passwordChangeSchema>;
export type Search = z.infer<typeof searchSchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;

// ============ VALIDATION UTILITIES ============

/**
 * Validates data against schema and throws formatted error
 */
export const validateData = async <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Promise<T> => {
  try {
    return await schema.parseAsync(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      logger.error('Validation failed', { messages, data });
      throw new Error(`Validation failed: ${messages}`);
    }
    throw error;
  }
};

/**
 * Validate synchronously (use for quick checks)
 */
export const validateDataSync = <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      logger.error('Sync validation failed', { messages, data });
      throw new Error(`Validation failed: ${messages}`);
    }
    throw error;
  }
};

/**
 * Validate and get formatted field errors (for form UI)
 */
export const getValidationErrors = (
  schema: z.ZodSchema,
  data: unknown
): Record<string, string> | null => {
  try {
    schema.parse(data);
    return null;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      error.errors.forEach(err => {
        const field = String(err.path[0]);
        fieldErrors[field] = err.message;
      });
      return fieldErrors;
    }
    return null;
  }
};

/**
 * Check if data is valid without throwing
 */
export const isValid = <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): boolean => {
  try {
    schema.parse(data);
    return true;
  } catch {
    return false;
  }
};

/**
 * Partial validation (for progressive form validation)
 */
export const validatePartial = <T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  fieldName: string
): string | null => {
  try {
    const result = schema.partial().parse(data);
    return null;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldError = error.errors.find(e => String(e.path[0]) === fieldName);
      return fieldError?.message || null;
    }
    return null;
  }
};
