import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Layouts & UI
import AppLayout from '@/components/layout/AppLayout';
import LazyLoadingFallback from '@/components/LazyLoadingFallback';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import OfflineIndicator from '@/components/OfflineIndicator';

// Hooks
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';

// Critical Pages (Eager)
import Dashboard from '@/pages/Dashboard';
import LoginPage from '@/pages/LoginPage';

// Lazy Pages
const AllOrdersPage = lazy(() => import('@/pages/AllOrdersPage'));
const NewOrderPage = lazy(() => import('@/pages/NewOrderPage'));
const EditOrderPage = lazy(() => import('@/pages/EditOrderPage'));
const OrderPage = lazy(() => import('@/pages/OrderPage'));
const QuotesPage = lazy(() => import('@/pages/QuotesPage'));
const QuoteDetailPage = lazy(() => import('@/pages/QuoteDetailPage'));
const NewQuotePage = lazy(() => import('@/pages/NewQuotePage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const SearchResultsPage = lazy(() => import('@/pages/SearchResultsPage'));
const UserManagementPage = lazy(() => import('@/pages/UserManagementPage'));
const CustomerHistoryPage = lazy(() => import('@/pages/CustomerHistoryPage'));
const ClockInOutPage = lazy(() => import('@/pages/ClockInOutPage'));
const PerformanceMetricsPage = lazy(() => import('@/pages/PerformanceMetricsPage'));

// Protection
import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';

const App: React.FC = () => {
  // ✅ Enable Supabase Realtime for live data updates
  useSupabaseRealtime();

  return (
    <>
      {/* ✅ NO PROVIDERS HERE - They are all in main.tsx */}
      <OfflineIndicator />
      
      <Suspense fallback={<LazyLoadingFallback />}>
        <Routes>
          {/* Public Route */}
          <Route path="/login" element={<ErrorBoundary><LoginPage /></ErrorBoundary>} />
    
          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<ErrorBoundary><AppLayout /></ErrorBoundary>}>
              
              {/* Critical */}
              <Route path="/" element={<Dashboard />} />
              
              {/* Lazy Loaded */}
              <Route path="/orders" element={<AllOrdersPage />} />
              <Route path="/new-order" element={<NewOrderPage />} />
              <Route path="/order/:orderNumber" element={<OrderPage />} />
              <Route path="/order/:orderNumber/edit" element={<EditOrderPage />} />
              <Route path="/quotes" element={<QuotesPage />} />
              <Route path="/quote/:quoteNumber" element={<QuoteDetailPage />} />
              <Route path="/new-quote" element={<NewQuotePage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/customers/:identifier" element={<CustomerHistoryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/search" element={<SearchResultsPage />} />
    
              {/* Attendance */}
              <Route path="/clock-in-out" element={<ClockInOutPage />} />
              
              {/* Admin */}
              <Route element={<ErrorBoundary><AdminRoute /></ErrorBoundary>}>
                <Route path="/user-management" element={<UserManagementPage />} />
                <Route path="/performance-metrics" element={<PerformanceMetricsPage />} />
              </Route>
    
              <Route path="*" element={<Navigate to="/" />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </>
  );
};

export default App;