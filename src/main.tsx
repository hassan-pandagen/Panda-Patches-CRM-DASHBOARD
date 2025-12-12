// src/main.tsx - FIXED VERSION (Consistent Imports)
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './constants/ToastContext';
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
import { queryClient } from './services/queryClient';
import './index.css';

// --- INITIALIZATION ---
initSentryAsync().catch((error) => {
  console.warn('Failed to initialize Sentry:', error);
});
versionChecker.init();
console.log('%c🐼 Panda Patches CRM', 'color: #ff6b35; font-weight: bold; font-size: 16px;');
console.log('Version:', versionChecker.getVersionInfo());

// --- CHUNK ERROR HANDLING ---
let isHandlingChunkError = false;
const handleChunkLoadingError = (errorMessage: string, source: string) => {
  const isChunkError = 
    errorMessage.includes('dynamically imported module') ||
    errorMessage.includes('Failed to fetch dynamically imported module') ||
    errorMessage.includes('Failed to load chunk') ||
    errorMessage.includes('Loading chunk') ||
    errorMessage.includes('Importing a module script failed') ||
    (source === 'filename' && errorMessage.includes('assets/') && errorMessage.includes('.js'));

  if (!isChunkError) return false;
  if (isHandlingChunkError) return true;

  isHandlingChunkError = true;
  logger.warn('🔄 Chunk loading error detected - app will reload', { message: errorMessage, source });

  // Log to Sentry for tracking (but don't send duplicate events)
  captureMessage('Chunk loading error - auto reload', 'warning', {
    errorType: 'chunk_loading',
    source,
    errorMessage,
  }).catch(() => {});

  // Show user-friendly message
  console.log('%c⚠️ Loading new version...', 'color: #ff6b35; font-weight: bold;');

  // Reload after a short delay to allow logging
  setTimeout(() => window.location.reload(), 500);
  return true;
};

window.addEventListener('error', (event) => {
  if (event.filename && handleChunkLoadingError(`${event.message} - ${event.filename}`, 'filename')) {
    event.preventDefault();
  } else if (event.error?.message && handleChunkLoadingError(event.error.message, 'error-object')) {
    event.preventDefault();
  }
}, true); // Use capture phase to catch errors early

window.addEventListener('unhandledrejection', (event) => {
  if (handleChunkLoadingError(event.reason?.message || String(event.reason), 'unhandled-rejection')) {
    event.preventDefault();
  }
});

// Initialize Supabase with the single client instance
initializeSupabaseClient(queryClient);

// Initialize offline support
offlineManager.registerServiceWorker();
(window as any).offlineManager = offlineManager;

// Create router
const router = createBrowserRouter([
  {
    path: '*',
    element: <App />,
  },
]);

// Safely get root
const rootElement = document.getElementById('root');
if (!rootElement) {
  const errorMsg = 'Fatal error: Root element (#root) not found in HTML';
  logger.error(errorMsg);
  document.body.innerHTML = `<div style="padding: 20px; color: red;">${errorMsg} <button onclick="location.reload()">Reload</button></div>`;
  throw new Error(errorMsg);
}

// --- RENDER ---
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ChunkErrorBoundary>
        {/* ✅ WRAPPER 1: QueryClient (Top Level) */}
        <QueryClientProvider client={queryClient}>
          {/* ✅ WRAPPER 2: AuthProvider (Has access to QueryClient) */}
          <AuthProvider>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ChunkErrorBoundary>
    </ErrorBoundary>
    <SpeedInsights />
  </React.StrictMode>
);