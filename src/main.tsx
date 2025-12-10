// src/main.tsx - FIXED VERSION
import React from 'react';
import * as ReactDOM from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigation,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SpeedInsights } from '@vercel/speed-insights/react';
import * as Sentry from '@sentry/react';
import {
  reactRouterV6BrowserTracingIntegration,
} from '@sentry/react';
import { AuthProvider } from './contexts/AuthContext';
import { ChunkLoadErrorBoundary } from './components/ChunkLoadErrorBoundary';
import { ErrorBoundary } from './components/ErrorBoundary';
import { offlineManager } from './services/offlineManager';
import { logger } from './services/logger';
import App from './App';
import { initializeSupabaseClient } from './services/supabaseClient';
import './index.css';

// ✅ UPGRADE 10: Initialize Sentry error tracking with tunnel to bypass ad blockers
Sentry.init({
  dsn: 'https://1d30e386f4968460dc23045cb808978d@o4510487337762816.ingest.us.sentry.io/4510487352639488',
  tunnel: '/api/sentry-proxy', // Proxy through own domain to bypass ad blockers
  integrations: [
    // Use the specific React Router v6 integration
    reactRouterV6BrowserTracingIntegration({
      // The `useEffect` hook is used to instrument the router once it's available.
      // This is the recommended way to handle async router setup.
      useEffect: React.useEffect, // React namespace used intentionally here (from module import)
      // Pass the hooks and helpers from react-router-dom
      useLocation,
      useNavigation,
      createRoutesFromChildren,
      matchRoutes,
    }),
  ],
  tracesSampleRate: 1.0,
  environment: import.meta.env.MODE,
});

// Make Sentry available in console for testing
(window as any).Sentry = Sentry;

// ✅ FIX: Catch chunk loading errors (dynamic import failures)
window.addEventListener('error', (event) => {
  // Check if this is a chunk loading error
  if (event.filename?.includes('assets/') && event.filename?.includes('.js')) {
    const error = new Error(`Failed to load chunk: ${event.filename}`);
    Sentry.captureException(error, {
      contexts: {
        chunkError: {
          filename: event.filename,
          message: event.message,
        }
      }
    });
    console.error('Chunk loading error caught and sent to Sentry:', event);
  }
});

// ✅ FIX: Also catch via unhandledrejection for promise-based dynamic imports
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message?.includes('dynamically imported module')) {
    Sentry.captureException(event.reason, {
      contexts: {
        dynamicImportError: {
          message: event.reason.message,
          reason: String(event.reason),
        }
      }
    });
    console.error('Dynamic import error caught and sent to Sentry:', event.reason);
  }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1, // Don't retry endlessly if Supabase is down
      refetchOnWindowFocus: false,
    },
  },
});

// ✅ FIX: Initialize Supabase client with queryClient to break circular dependencies
initializeSupabaseClient(queryClient);

// ✅ UPGRADE 9: Initialize offline support
offlineManager.registerServiceWorker();
(window as any).offlineManager = offlineManager;

// Create a browser router instance.
const router = createBrowserRouter([
  {
    path: '*',
    element: <App />,
  },
]);

// The Sentry.withSentryReactRouterV6Routing HOC will automatically
// instrument the router passed to RouterProvider.
const SentryRouterProvider = Sentry.withSentryReactRouterV6Routing(RouterProvider);


// ✅ DAY 1 FIX: Safely get root element with proper error handling
const rootElement = document.getElementById('root');

if (!rootElement) {
  const errorMsg = 'Fatal error: Root element (#root) not found in HTML';
  logger.error(errorMsg);
  document.body.innerHTML = `<div style="color: red; padding: 20px; font-family: monospace;">${errorMsg}</div>`;
  throw new Error(errorMsg);
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ChunkLoadErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SentryRouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </ChunkLoadErrorBoundary>
      <SpeedInsights />
    </ErrorBoundary>
  </React.StrictMode>
);