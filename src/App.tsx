import React, { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

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
const BulkCostEntryPage = lazy(() => import('@/pages/BulkCostEntryPage'));
const CustomersPage = lazy(() => import('@/pages/CustomersPage'));
const ActivityPage = lazy(() => import('@/pages/ActivityPage'));
const InboxPage = lazy(() => import('@/pages/InboxPage'));
const PaymentFormPage = lazy(() => import('@/pages/PaymentFormPage'));

// Protection
import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';
import HostnameRouter from './HostnameRouter';

// Public payment form — agent-generated /pay/:token flow (NOT part of the customer login portal,
// which now lives on the marketing website).
const PaymentFormLandingPage = lazy(() => import('@/pages/customer/PaymentFormLandingPage'));

// 404
import NotFoundPage from '@/pages/NotFoundPage';

const App: React.FC = () => {
  // ✅ Enable Supabase Realtime for live data updates
  useSupabaseRealtime();

  return (
    <>
      {/* ✅ NO PROVIDERS HERE - They are all in main.tsx */}
      <OfflineIndicator />
      
      <Suspense fallback={<LazyLoadingFallback />}>
        <HostnameRouter>
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
              <Route path="/activity" element={<ActivityPage />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/inbox/:conversationId" element={<InboxPage />} />
              <Route path="/payment-forms" element={<PaymentFormPage />} />
    
              {/* Attendance */}
              <Route path="/clock-in-out" element={<ClockInOutPage />} />
              
              {/* Admin */}
              <Route element={<ErrorBoundary><AdminRoute /></ErrorBoundary>}>
                <Route path="/bulk-cost-entry" element={<BulkCostEntryPage />} />
                <Route path="/user-management" element={<UserManagementPage />} />
                <Route path="/performance-metrics" element={<PerformanceMetricsPage />} />
                <Route path="/portal-customers" element={<CustomersPage />} />
              </Route>
    
            </Route>
          </Route>

          {/* ====== PUBLIC PAYMENT FORM ====== */}
          {/* Agent-generated payment link — no auth required. The customer login portal
              now lives on the marketing website; only this payment flow remains here. */}
          <Route path="/pay/:token" element={<ErrorBoundary><PaymentFormLandingPage /></ErrorBoundary>} />
          <Route path="/pay/:token/thank-you" element={<ErrorBoundary><PaymentFormLandingPage /></ErrorBoundary>} />

          {/* 404 — outside protected routes so all unknown paths return not-found */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </HostnameRouter>
      </Suspense>
    </>
  );
};

export default App;