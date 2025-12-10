/**
 * Lazy-loaded Sentry initialization
 * Only imports Sentry when actually used (after app is interactive)
 * Reduces initial bundle size by ~330KB
 */

let sentryPromise: Promise<typeof import('@sentry/react')> | null = null;
let sentryInstance: typeof import('@sentry/react') | null = null;

/**
 * Initialize Sentry asynchronously
 */
export async function initSentryAsync() {
  if (sentryInstance) {
    return sentryInstance;
  }

  if (sentryPromise) {
    return sentryPromise;
  }

  sentryPromise = import('@sentry/react');
  sentryInstance = await sentryPromise;

  const Sentry = sentryInstance;
  const { reactRouterV6BrowserTracingIntegration } = await import('@sentry/react');
  const { createRoutesFromChildren, matchRoutes, useLocation, useNavigation } = await import('react-router-dom');
  const React = await import('react');

  // Initialize Sentry
  if (!Sentry.isInitialized?.()) {
    Sentry.init({
      dsn: 'https://1d30e386f4968460dc23045cb808978d@o4510487337762816.ingest.us.sentry.io/4510487352639488',
      tunnel: '/api/sentry-proxy', // Proxy through own domain to bypass ad blockers
      integrations: [
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigation,
          createRoutesFromChildren,
          matchRoutes,
        }),
      ],
      tracesSampleRate: 1.0,
      environment: import.meta.env.MODE,
      beforeSend(event, hint) {
        // Filter out chunk loading errors from being sent multiple times
        const error = hint.originalException;
        if (error && typeof error === 'object' && 'message' in error) {
          const message = String(error.message);
          if (message.includes('dynamically imported module') || 
              message.includes('Failed to fetch dynamically imported module')) {
            console.warn('Chunk error intercepted:', message);
            return null;
          }
        }
        return event;
      },
    });

    // Make Sentry available in console
    (window as any).Sentry = Sentry;
  }

  return sentryInstance;
}

/**
 * Get Sentry instance (returns null if not initialized yet)
 */
export function getSentry() {
  return sentryInstance;
}

/**
 * Capture exception (with fallback if Sentry not loaded)
 */
export async function captureException(error: Error, context?: Record<string, any>) {
  const Sentry = getSentry() || (await initSentryAsync());
  if (Sentry) {
    Sentry.captureException(error, { extra: context });
  } else {
    console.error('Sentry not available, logging error:', error, context);
  }
}

/**
 * Capture message (with fallback if Sentry not loaded)
 */
export async function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, any>) {
  const Sentry = getSentry() || (await initSentryAsync());
  if (Sentry) {
    Sentry.captureMessage(message, {
      level,
      extra: context,
    });
  } else {
    console.log(`[${level.toUpperCase()}] ${message}`, context);
  }
}

/**
 * Get Sentry Router Provider (wrapped)
 * Call this only after Sentry is initialized
 */
export async function getSentryRouterProvider() {
  const Sentry = getSentry() || (await initSentryAsync());
  return Sentry?.withSentryReactRouterV6Routing;
}
