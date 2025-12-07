// src/services/logger.ts
// ✅ UPGRADE 6: Production-ready logging service

import * as Sentry from "@sentry/react";

/**
 * Logger service that:
 * - Only logs in development mode (console.log/warn hidden in production)
 * - Always logs errors (even in production - for debugging)
 * - Sends errors to Sentry in production
 */
export const logger = {
  /**
   * Info logs (hidden in production, shown in development)
   */
  info: (message: string, data?: any) => {
    if (import.meta.env.DEV) {
      console.log(`[INFO] ${message}`, data ? data : '');
    }
  },

  /**
   * Warning logs (hidden in production, shown in development)
   */
  warn: (message: string, data?: any) => {
    if (import.meta.env.DEV) {
      console.warn(`[WARN] ${message}`, data ? data : '');
    }
  },

  /**
   * Error logs (ALWAYS shown, even in production)
   * Sends errors to Sentry in production
   */
  error: (message: string, error?: any, context?: Record<string, any>) => {
    console.error(`[ERROR] ${message}`, error ? error : '');
    
    // Send to Sentry in production
    if (import.meta.env.PROD) {
      const sentryError = error instanceof Error ? error : new Error(message);
      Sentry.captureException(sentryError, { 
        extra: { 
          originalMessage: message,
          ...context 
        } 
      });
    }
  },

  /**
   * Debug logs (very verbose, only in development)
   */
  debug: (message: string, data?: any) => {
    if (import.meta.env.DEV) {
      console.debug(`[DEBUG] ${message}`, data ? data : '');
    }
  },
};
