// src/main.tsx - FIXED VERSION
import React from 'react';
import * as ReactDOM from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider } from './contexts/AuthContext';
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary';
import { ErrorBoundary } from './components/ErrorBoundary';
import { offlineManager } from './services/offlineManager';
import { logger } from './services/logger';
import { versionChecker } from './services/versionChecker';
import { initSentryAsync, captureMessage } from './services/sentryLoader';
import App from './App';
import { initializeSupabaseClient } from './services/supabaseClient';
import './index.css';

// ✅ UPGRADE 11: Lazy-load Sentry to reduce initial bundle from 1.9MB to ~1.2MB
// Sentry will be initialized asynchronously after app is interactive
initSentryAsync().catch((error) => {
  console.warn('Failed to initialize Sentry:', error);
});

// ✅ Initialize version checker FIRST (before other initialization)
versionChecker.init();

// ✅ Log version info for debugging
console.log('%c🐼 Panda Patches CRM', 'color: #ff6b35; font-weight: bold; font-size: 16px;');
console.log('Version:', versionChecker.getVersionInfo());

// Global flag to prevent multiple reloads
let isHandlingChunkError = false;

/**
 * ✅ IMPROVED: Comprehensive chunk loading error handler
 * Handles both runtime errors and promise rejections
 */
const handleChunkLoadingError = (errorMessage: string, source: string) => {
  // Check if this is actually a chunk loading error
  const isChunkError = 
    errorMessage.includes('dynamically imported module') ||
    errorMessage.includes('Failed to fetch dynamically imported module') ||
    errorMessage.includes('Failed to load chunk') ||
    errorMessage.includes('Loading chunk') ||
    errorMessage.includes('Importing a module script failed') ||
    (source === 'filename' && errorMessage.includes('assets/') && errorMessage.includes('.js'));

  if (!isChunkError) {
    return false; // Not a chunk error
  }

  // Prevent multiple simultaneous reloads
  if (isHandlingChunkError) {
    console.log('Already handling chunk error, ignoring duplicate');
    return true;
  }

  isHandlingChunkError = true;
  
  logger.warn('🔄 Chunk loading error detected - app will reload', {
    message: errorMessage,
    source,
  });

  // Log to Sentry for tracking (but don't send duplicate events)
  captureMessage('Chunk loading error - auto reload', 'warning', {
    errorType: 'chunk_loading',
    source,
    errorMessage,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  }).catch(() => {
    // Sentry not ready yet, that's ok
  });

  // Show user-friendly message
  console.log('%c⚠️ Loading new version...', 'color: #ff6b35; font-weight: bold;');

  // Reload after a short delay to allow logging
  setTimeout(() => {
    window.location.reload();
  }, 500);

  return true;
};

/**
 * ✅ FIX: Catch chunk loading errors from script tags
 * These occur when a <script> tag fails to load
 */
window.addEventListener('error', (event) => {
  // Handle errors from script loading
  if (event.filename) {
    const handled = handleChunkLoadingError(
      `${event.message} - ${event.filename}`,
      'filename'
    );
    if (handled) {
      event.preventDefault();
      return;
    }
  }

  // Handle errors from the error object itself
  if (event.error?.message) {
    const handled = handleChunkLoadingError(
      event.error.message,
      'error-object'
    );
    if (handled) {
      event.preventDefault();
      return;
    }
  }
}, true); // Use capture phase to catch errors early

/**
 * ✅ FIX: Catch chunk loading errors from dynamic imports
 * These occur when import() promises are rejected
 */
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  const errorMessage = error?.message || String(error);
  
  const handled = handleChunkLoadingError(
    errorMessage,
    'unhandled-rejection'
  );
  
  if (handled) {
    event.preventDefault();
  }
});

/**
 * ✅ NEW: Monitor route changes for chunk errors
 * Some chunk errors only manifest during navigation
 */
let lastLocation = window.location.pathname;
const checkLocationChange = () => {
  const currentLocation = window.location.pathname;
  if (currentLocation !== lastLocation) {
    lastLocation = currentLocation;
    // Reset the flag on successful navigation
    isHandlingChunkError = false;
  }
};
window.addEventListener('popstate', checkLocationChange);
window.addEventListener('pushstate', checkLocationChange);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ✅ Initialize Supabase client
initializeSupabaseClient(queryClient);

// ✅ Initialize offline support
offlineManager.registerServiceWorker();
(window as any).offlineManager = offlineManager;

// Create router
const router = createBrowserRouter([
  {
    path: '*',
    element: <App />,
  },
]);

// Use regular RouterProvider (Sentry wrapping happens in ErrorBoundary after initialization)
const SentryRouterProvider = RouterProvider;

// ✅ Safely get root element
const rootElement = document.getElementById('root');

if (!rootElement) {
  const errorMsg = 'Fatal error: Root element (#root) not found in HTML';
  logger.error(errorMsg);
  document.body.innerHTML = `
    <div style="
      color: #ff6b35;
      padding: 40px;
      font-family: system-ui, -apple-system, sans-serif;
      text-align: center;
      max-width: 600px;
      margin: 100px auto;
      background: #1e293b;
      border-radius: 12px;
      border: 2px solid #ff6b35;
    ">
      <h1 style="font-size: 48px; margin-bottom: 20px;">⚠️</h1>
      <h2 style="margin-bottom: 10px;">Application Error</h2>
      <p style="color: #94a3b8;">${errorMsg}</p>
      <button 
        onclick="window.location.reload()" 
        style="
          margin-top: 20px;
          padding: 12px 24px;
          background: #ff6b35;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          font-weight: bold;
        "
      >
        Reload Page
      </button>
    </div>
  `;
  throw new Error(errorMsg);
}

// ✅ Render app
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ChunkErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SentryRouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </ChunkErrorBoundary>
    </ErrorBoundary>
    <SpeedInsights />
  </React.StrictMode>
);