import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SpeedInsights } from '@vercel/speed-insights/react'; // ✅ UPGRADE 2: Performance monitoring
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary'; // <--- 1. IMPORT THIS
import { performanceMonitor } from './services/performanceMonitor'; // ✅ UPGRADE 8: Performance monitoring
import { offlineManager } from './services/offlineManager'; // ✅ UPGRADE 9: Offline support
import App from './App';
import './index.css';

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* 2. WRAP EVERYTHING INSIDE ERROR BOUNDARY */}
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
      {/* ✅ UPGRADE 2: Vercel Speed Insights for performance monitoring */}
      <SpeedInsights />
    </ErrorBoundary>
  </React.StrictMode>
);