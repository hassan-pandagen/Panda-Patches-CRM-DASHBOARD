// src/App.tsx - Code Splitting Implementation

import React, { lazy, Suspense } from 'react';

// ✅ NEW: Import QueryClient and Provider
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './constants/ToastContext';

// Your Layouts (Keep eager for immediate render)
import AppLayout from '@/components/layout/AppLayout';
import LazyLoadingFallback from '@/components/LazyLoadingFallback';

// ✅ UPGRADE 1: Critical paths - Load immediately
import Dashboard from '@/pages/Dashboard';
import LoginPage from '@/pages/LoginPage';

// ✅ UPGRADE 1: Non-critical pages - Load on-demand (lazy)
const AllOrdersPage = lazy(() => import('@/pages/AllOrdersPage'));
const NewOrderPage = lazy(() => import('@/pages/NewOrderPage'));
const EditOrderPage = lazy(() => import('@/pages/EditOrderPage'));
const OrderPage = lazy(() => import('@/pages/OrderPage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const SearchResultsPage = lazy(() => import('@/pages/SearchResultsPage'));
const UserManagementPage = lazy(() => import('@/pages/UserManagementPage'));
const CustomerHistoryPage = lazy(() => import('@/pages/CustomerHistoryPage'));
const ClockInOutPage = lazy(() => import('@/pages/ClockInOutPage'));

// Your Protection Components
import ProtectedRoute from './ProtectedRoute'; // Adjust path if needed
import AdminRoute from './AdminRoute'; // Adjust path if needed

// ✅ NEW: Import ErrorBoundary for error handling
import { ErrorBoundary } from '@/components/ErrorBoundary';

// ✅ UPGRADE 3: Create QueryClient with production-ready config
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,              // Keep data fresh for 5min
      gcTime: 10 * 60 * 1000,                // Hold in memory for 10min
      retry: (failureCount) => failureCount < 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: 'stale',         // Only refetch if stale
      refetchOnReconnect: 'stale',           // Smart reconnect
    },
    mutations: {
      retry: (failureCount) => failureCount < 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

const App: React.FC = () => {
  return (
    // ✅ NEW: Wrap everything in QueryClientProvider
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {/* ✅ UPGRADE 1: Suspense boundary for lazy-loaded routes */}
        <Suspense fallback={<LazyLoadingFallback />}>
          <Routes>
            {/* Public Route: Anyone can access the login page. */}
            <Route path="/login" element={<ErrorBoundary><LoginPage /></ErrorBoundary>} />
     
            {/* All other routes are nested inside the ProtectedRoute. */}
            {/* This ensures the user is authenticated and the loading state is handled. */}
            <Route element={<ProtectedRoute />}>
              {/* All protected routes will render inside the AppLayout with error boundary */}
              <Route element={<ErrorBoundary><AppLayout /></ErrorBoundary>}>
                
                {/* --- CRITICAL ROUTES (EAGER) --- */}
                <Route path="/" element={<Dashboard />} />
                
                {/* --- NON-CRITICAL ROUTES (LAZY-LOADED) --- */}
                <Route path="/orders" element={<AllOrdersPage />} />
                <Route path="/new-order" element={<NewOrderPage />} />
                <Route path="/order/:orderNumber" element={<OrderPage />} />
                <Route path="/order/:orderNumber/edit" element={<EditOrderPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/customers/:identifier" element={<CustomerHistoryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/search" element={<SearchResultsPage />} />
     
                {/* ✅ ATTENDANCE ROUTES */}
                {/* All users can clock in/out */}
                <Route path="/clock-in-out" element={<ClockInOutPage />} />
                
                {/* Admin-only routes with error boundary */}
                <Route element={<ErrorBoundary><AdminRoute /></ErrorBoundary>}>
                  <Route path="/user-management" element={<UserManagementPage />} />
                </Route>
     
                <Route path="*" element={<Navigate to="/" />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </ToastProvider>
    </QueryClientProvider>
  );
};

export default App;