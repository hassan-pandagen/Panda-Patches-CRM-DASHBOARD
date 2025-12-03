// src/App.tsx - FINAL, CORRECTED VERSION

import React from 'react';

// ✅ NEW: Import QueryClient and Provider
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './constants/ToastContext';

// Your Pages and Layouts
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import AllOrdersPage from '@/pages/AllOrdersPage';
import NewOrderPage from '@/pages/NewOrderPage';
import EditOrderPage from '@/pages/EditOrderPage';
import OrderPage from '@/pages/OrderPage';
import ReportsPage from '@/pages/ReportsPage';
import SettingsPage from '@/pages/SettingsPage';
import LoginPage from '@/pages/LoginPage';
import SearchResultsPage from '@/pages/SearchResultsPage';
import UserManagementPage from '@/pages/UserManagementPage';
import CustomerHistoryPage from '@/pages/CustomerHistoryPage';

// Your Protection Components
import ProtectedRoute from './ProtectedRoute'; // Adjust path if needed
import AdminRoute from './AdminRoute'; // Adjust path if needed

// ✅ NEW: Create a new instance of QueryClient and export it
export const queryClient = new QueryClient();

const App: React.FC = () => {
  return (
    // ✅ NEW: Wrap everything in QueryClientProvider
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Routes>
          {/* Public Route: Anyone can access the login page. */}
          <Route path="/login" element={<LoginPage />} />
  
          {/* All other routes are nested inside the ProtectedRoute. */}
          {/* This ensures the user is authenticated and the loading state is handled. */}
          <Route element={<ProtectedRoute />}>
            {/* All protected routes will render inside the AppLayout */}
            <Route element={<AppLayout />}>
              
              {/* --- ALWAYS RENDER ALL POSSIBLE ROUTES --- */}
              <Route path="/" element={<Dashboard />} />
              <Route path="/orders" element={<AllOrdersPage />} />
              <Route path="/new-order" element={<NewOrderPage />} />
              <Route path="/order/:orderNumber" element={<OrderPage />} />
              <Route path="/order/:orderNumber/edit" element={<EditOrderPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/customers/:identifier" element={<CustomerHistoryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/search" element={<SearchResultsPage />} />
  
              {/* This admin route is now wrapped in the AdminRoute component */}
              {/* It will always exist, but only admins can access it. */}
              <Route element={<AdminRoute />}>
                <Route path="/user-management" element={<UserManagementPage />} />
              </Route>
  
              {/* Catch-all redirects to the dashboard */}
              <Route path="*" element={<Navigate to="/" />} />
            </Route>
          </Route>
        </Routes>
      </ToastProvider>
    </QueryClientProvider>
  );
};

export default App;