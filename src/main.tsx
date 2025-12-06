import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SpeedInsights } from '@vercel/speed-insights/react';
import * as Sentry from "@sentry/react";
import { browserTracingIntegration } from "@sentry/react";
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { performanceMonitor } from './services/performanceMonitor';
import { offlineManager } from './services/offlineManager';
import { logger } from './services/logger';
import App from './App';
import './index.css';

// ✅ UPGRADE 10: Initialize Sentry error tracking with tunnel to bypass ad blockers
Sentry.init({
  dsn: "https://1d30e386f4968460dc23045cb808978d@o4510487337762816.ingest.us.sentry.io/4510487352639488",
  tunnel: "/api/sentry-proxy", // Proxy through own domain to bypass ad blockers
  integrations: [
    browserTracingIntegration(),
  ],
  tracesSampleRate: 1.0,
  environment: import.meta.env.MODE,
});

// Make Sentry available in console for testing
(window as any).Sentry = Sentry;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1, // Don't retry endlessly if Supabase is down
      refetchOnWindowFocus: false,
    },
  },
});

// ✅ UPGRADE 8: Initialize performance monitoring
if (import.meta.env.DEV) {
  // Make performanceMonitor available in browser console for debugging
  (window as any).performanceMonitor = performanceMonitor;
}

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

// ✅ Wrap router with Sentry
const SentryRoutes = Sentry.withSentryRouting(router);

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
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={SentryRoutes} />
        </AuthProvider>
      </QueryClientProvider>
      <SpeedInsights />
    </ErrorBoundary>
  </React.StrictMode>
);