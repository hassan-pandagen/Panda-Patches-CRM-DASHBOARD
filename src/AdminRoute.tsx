import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { UserRole } from './types';

const AdminRoute: React.FC = () => {
  const { role, isLoading } = useAuth();

  // CRITICAL FIX: The parent ProtectedRoute only waits for the session.
  // We must also wait for the user profile (which contains the role) to finish loading.
  // The `isLoading` flag from useAuth correctly handles this.
  if (isLoading) {
    // Show a loading state while waiting for auth context
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-slate-700 border-t-brand-orange animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (role !== UserRole.ADMIN) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default AdminRoute;