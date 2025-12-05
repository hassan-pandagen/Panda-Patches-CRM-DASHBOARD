// src/services/logger.ts
// ✅ UPGRADE 6: Production-ready logging service

/**
 * Logger service that:
 * - Only logs in development mode (console.log/warn hidden in production)
 * - Always logs errors (even in production - for debugging)
 * - Can be extended to send errors to Sentry in the future
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
   * Future: Can integrate with Sentry here
   */
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${message}`, error ? error : '');
    
    // Future: Send to Sentry
    // if (import.meta.env.PROD) {
    //   Sentry.captureException(new Error(message), { extra: { error } });
    // }
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
