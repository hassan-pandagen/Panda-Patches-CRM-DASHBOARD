// src/App.tsx

import { createBrowserRouter, RouterProvider, RouteObject } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { UserRole } from './types';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/Dashboard';
import AllOrdersPage from './pages/AllOrdersPage';
import NewOrderPage from './pages/NewOrderPage';
import OrderPage from './pages/OrderPage';
import EditOrderPage from './pages/EditOrderPage';
import ReportsPage from './pages/ReportsPage';
import UserManagementPage from './pages/UserManagement';
import SettingsPage from './pages/SettingsPage';
import EmailTemplatesPage from './pages/EmailTemplatesPage';
import SearchResultsPage from './pages/SearchResultsPage';
import AppLayout from './components/layout/AppLayout';
import NotFoundPage from './pages/NotFoundPage';

// ---------------------------
// THE FIX: Simplified Routes Configuration
// ---------------------------
const routes: RouteObject[] = [
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    // STEP 1: The AppLayout is protected ONCE here. This is the only protection it needs.
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    // STEP 2: The children are now clean. They do not need their own ProtectedRoute wrapper.
    // They are implicitly protected because they can only be reached through the parent AppLayout.
    children: [
      {
        index: true,
        element: (
          <ProtectedRoute roles={[UserRole.ADMIN]}><DashboardPage /></ProtectedRoute>
        ),
      },
      {
        path: 'orders',
        element: <AllOrdersPage />,
      },
      {
        path: 'order/:orderNumber',
        element: <OrderPage />,
      },
      {
        path: 'order/:orderNumber/edit',
        element: <EditOrderPage />,
      },
      {
        path: 'new-order',
        element: <NewOrderPage />,
      },
      {
        path: 'reports',
        // STEP 3: We now protect the role-specific routes here.
        // This single wrapper will check for the role and render the page.
        element: (
          <ProtectedRoute roles={[UserRole.ADMIN, UserRole.AGENT, UserRole.PRODUCTION]}>
            <ReportsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'search',
        element: <SearchResultsPage />,
      },
      {
        path: 'users',
        element: (
          <ProtectedRoute roles={[UserRole.ADMIN]}>
            <UserManagementPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'email-templates',
        element: (
          <ProtectedRoute roles={[UserRole.ADMIN]}>
            <EmailTemplatesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings',
        element: (
          <ProtectedRoute roles={[UserRole.ADMIN]}>
            <SettingsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
];

// ---------------------------
// App Root (No changes needed)
// ---------------------------
const router = createBrowserRouter(routes);

const App = () => <RouterProvider router={router} />;

export default App;