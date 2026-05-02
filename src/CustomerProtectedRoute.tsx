import * as React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { CustomerAuthProvider, useCustomerAuth } from './contexts/CustomerAuthContext';

// Inner component that uses the context
const CustomerAuthGuard: React.FC = () => {
  const { user, isLoading, isCustomer } = useCustomerAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/customer/login" state={{ from: location }} replace />;
  }

  // If user exists in user_profiles (internal staff), redirect to CRM
  if (!isCustomer) {
    return <Navigate to="/" replace />;
  }

  // Force password setup if app_metadata.password_set is not true
  // This blocks customers from reaching the dashboard until they explicitly set a password
  const passwordSet = user.app_metadata?.password_set === true;
  const isOnSetPasswordPage = location.pathname === '/customer/set-password';

  if (!passwordSet && !isOnSetPasswordPage) {
    return <Navigate to="/customer/set-password" replace />;
  }

  return <Outlet />;
};

// Wrapper that provides the CustomerAuthContext
const CustomerProtectedRoute: React.FC = () => {
  return (
    <CustomerAuthProvider>
      <CustomerAuthGuard />
    </CustomerAuthProvider>
  );
};

export default CustomerProtectedRoute;
