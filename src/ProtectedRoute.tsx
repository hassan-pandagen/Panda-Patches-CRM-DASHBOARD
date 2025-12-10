// src/ProtectedRoute.tsx - FIXED VERSION
import * as React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AppLoader from './components/ui/AppLoader';

const ProtectedRoute: React.FC = () => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    // ✅ Use the new, professional AppLoader
    return <AppLoader />;
  }

  if (!user) {
    // If the user is not authenticated, redirect them to the login page.
    // We also pass the original location they were trying to access.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If the user is authenticated, render the nested routes.
  return <Outlet />;
};

export default ProtectedRoute;