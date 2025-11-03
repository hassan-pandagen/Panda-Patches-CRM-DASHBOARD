import React from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProtectedRoute from './ProtectedRoute';

// Layouts
import AppLayout from './components/layout/AppLayout';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/Dashboard';
import OrderPage from './pages/OrderPage';
import NewOrderPage from './pages/NewOrderPage';
import EditOrderPage from './pages/EditOrderPage';
import ReportsPage from './pages/ReportsPage';
import SearchResultsPage from './pages/SearchResultsPage';
import UserManagementPage from './pages/UserManagement';
import SettingsPage from './pages/SettingsPage';
import EmailTemplatesPage from './pages/EmailTemplatesPage';
import UpdatePasswordPage from './pages/UpdatePasswordPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import AllOrdersPage from './pages/AllOrdersPage';
import CEODashboard from './pages/CEODashboard';
import { UserRole } from './types/index';

// Create a client
const queryClient = new QueryClient();

const MainDashboard: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === UserRole.ADMIN) {
    return <CEODashboard />;
  }
  return <DashboardPage />;
};

const router = createHashRouter([
  // ============================================
  // PUBLIC ROUTES (No Sidebar/Header)
  // ============================================
  { 
    path: "/login", 
    element: <LoginPage /> 
  },
  { 
    path: "/forgot-password", 
    element: <ForgotPasswordPage /> 
  },
  { 
    path: "/update-password", 
    element: <UpdatePasswordPage /> 
  },
  
  // ============================================
  // PROTECTED ROUTES (With Sidebar/Header via AppLayout)
  // ============================================
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { 
        index: true,
        element: <ProtectedRoute><MainDashboard /></ProtectedRoute> 
      },
      { 
        path: "orders", 
        element: <ProtectedRoute><AllOrdersPage /></ProtectedRoute> 
      },
      { 
        path: "order/:orderNumber", 
        element: <ProtectedRoute><OrderPage /></ProtectedRoute> 
      },
      { 
        path: "order/:orderNumber/edit", 
        element: <ProtectedRoute><EditOrderPage /></ProtectedRoute> 
      },
      { 
        path: "new-order", 
        element: <ProtectedRoute><NewOrderPage /></ProtectedRoute> 
      },
      { 
        path: "search", 
        element: <ProtectedRoute><SearchResultsPage /></ProtectedRoute> 
      },
      { 
        path: "email-templates", 
        element: <ProtectedRoute><EmailTemplatesPage /></ProtectedRoute> 
      },
      { 
        path: "settings", 
        element: <ProtectedRoute><SettingsPage /></ProtectedRoute> 
      },
      // Admin-only routes
      { 
        path: "reports", 
        element: <ProtectedRoute roles={[UserRole.ADMIN]}><ReportsPage /></ProtectedRoute> 
      },
      { 
        path: "ceo-dashboard", 
        element: <ProtectedRoute roles={[UserRole.ADMIN]}><CEODashboard /></ProtectedRoute> 
      },
      { 
        path: "users", 
        element: <ProtectedRoute roles={[UserRole.ADMIN]}><UserManagementPage /></ProtectedRoute> 
      },
    ],
  },
]);

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </QueryClientProvider>
);

const ThemedApp: React.FC = () => (
  <div className="bg-[#0A0A0F] text-slate-100 min-h-screen">
    <App />
  </div>
);

export default ThemedApp;