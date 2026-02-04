// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './constants/ToastContext';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Analytics } from '@vercel/analytics/react';
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

// --- CHUNK ERROR HANDLING (FIXED) ---
let isHandlingChunkError = false;

const handleChunkLoadingError = (errorMessage: string, source: string) => {
  // Normalize error message for easier checking
  const msg = errorMessage.toLowerCase();

  const isChunkError = 
    msg.includes('dynamically imported module') ||
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('failed to load chunk') ||
    msg.includes('loading chunk') ||
    msg.includes('importing a module script failed') ||
    msg.includes('missing script') ||
    // ✅ FIX: Catch 404s on assets specifically (like your Sentry error)
    (msg.includes('error') && msg.includes('/assets/') && msg.includes('.js')) ||
    msg.includes('net::err_aborted');

  if (!isChunkError) return false;
  
  // Prevent infinite loops
  if (isHandlingChunkError) return true;

  isHandlingChunkError = true;
  logger.warn('🔄 Chunk loading error detected - app will reload', { message: errorMessage, source });

  captureMessage('Chunk loading error - auto reload', 'warning', {
    errorType: 'chunk_loading',
    source,
    errorMessage,
  }).catch(() => {});

  // Show visual feedback before reload
  console.log('%c⚠️ New version detected, updating...', 'color: #ff6b35; font-weight: bold; font-size: 14px;');

  // ✅ FIX: Use location.reload(true) to force cache bypass if possible
  setTimeout(() => {
    window.location.reload(); 
  }, 200); // Faster reload
  return true;
};

// Listener 1: Script Loading Errors
window.addEventListener('error', (event) => {
  // Check if it's a script file error
  const isScriptError = event.target && (event.target as HTMLElement).tagName === 'SCRIPT';
  const filename = event.filename || (isScriptError ? (event.target as HTMLScriptElement).src : '');

  if (filename && handleChunkLoadingError(`${event.message} - ${filename}`, 'script-error')) {
    event.preventDefault();
  }
}, true); 

// Listener 2: Promise Rejections (Dynamic Imports)
window.addEventListener('unhandledrejection', (event) => {
  if (handleChunkLoadingError(event.reason?.message || String(event.reason), 'unhandled-rejection')) {
    event.preventDefault();
  }
});

// Initialize Supabase
initializeSupabaseClient(queryClient);
offlineManager.registerServiceWorker();
(window as any).offlineManager = offlineManager;

// ✅ Register Service Worker for deployment cache busting
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('✅ Service Worker registered:', registration);
        
        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60000); // Check every 60 seconds
        
        // Listen for new version
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Show update notification
                console.log('🔄 New version available - prompting user');
                const message = 'New version available! Reload to get the latest updates.';
                if (confirm(message)) {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                }
              }
            });
          }
        });
      })
      .catch((error) => {
        console.warn('⚠️ Service Worker registration failed:', error);
      });
  });
}

const router = createBrowserRouter([{ path: '*', element: <App /> }]);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ChunkErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ChunkErrorBoundary>
    </ErrorBoundary>
    <SpeedInsights />
    <Analytics />
  </React.StrictMode>
);