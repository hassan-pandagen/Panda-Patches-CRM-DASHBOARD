import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext'; // Corrected path
import Spinner from './components/ui/Spinner'; // Corrected path

const ProtectedRoute: React.FC = () => {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-900">
        <Spinner />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;