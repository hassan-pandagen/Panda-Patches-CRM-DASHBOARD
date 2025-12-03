// src/ProtectedRoute.tsx

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

const ProtectedRoute: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  console.log('🛡️ ProtectedRoute:', { isAuthenticated, isLoading });

  if (isLoading) {
    console.log('⏳ Still loading...');
    return (
      <div className="flex justify-center items-center h-screen bg-slate-900">
        <div className="text-white text-xl">Loading... (isLoading={String(isLoading)})</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('❌ Not authenticated, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  console.log('✅ Authenticated, rendering children');
  return <Outlet />;
};

export default ProtectedRoute;