import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { UserRole } from './types';

const AdminRoute: React.FC = () => {
  const { role, isLoading } = useAuth();

  // CRITICAL FIX: The parent ProtectedRoute only waits for the session.
  // We must also wait for the user profile (which contains the role) to finish loading.
  // The `isLoading` flag from useAuth correctly handles this.
  // Returning null is safe because ProtectedRoute is already showing a full-page spinner.
  if (isLoading) {
    return null;
  }

  if (role !== UserRole.ADMIN) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default AdminRoute;