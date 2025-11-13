import React, { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { UserRole } from './types'; // ✅ Corrected import from UserRoleType to UserRole

interface ProtectedRouteProps {
  children: ReactNode;
  roles?: UserRole[]; // Optional: restrict to certain roles (e.g., ['ADMIN'])
  redirectPath?: string; // New: path to redirect to if roles don't match
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles, redirectPath }) => {
  const { isAuthenticated, isLoading, role } = useAuth();

  // Show a simple loader or skeleton while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-slate-200">
        Checking permissions...
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If route requires specific roles and user doesn't match → redirect home
  if (roles && role && !roles.includes(role)) {
    // Redirect to the specified path, or /orders for PRODUCTION, otherwise /
    return <Navigate to={redirectPath || (role === UserRole.PRODUCTION ? '/orders' : '/')} replace />;
  }

  // Otherwise, render the protected content
  return <>{children}</>;
};

export default ProtectedRoute;
