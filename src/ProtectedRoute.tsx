import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Spinner from "./components/ui/Spinner";

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
}

/**
 * ProtectedRoute ensures:
 * 1. Only authenticated users access private routes.
 * 2. Optional role-based access control.
 * 3. Prevents redirect loops during async user/profile loading.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles }) => {
  const { user, session, loading } = useAuth();
  const location = useLocation();

  // 1️⃣ While checking authentication (session + user), show spinner
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Spinner />
      </div>
    );
  }

  // 2️⃣ If there’s no session, redirect to login
  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3️⃣ Handle role-based access
  if (roles && roles.length > 0) {
    // If user profile hasn’t loaded yet, wait
    if (!user) {
      return (
        <div className="flex justify-center items-center h-screen">
          <Spinner />
        </div>
      );
    }

    // If user is loaded but lacks permission, redirect
    if (!roles.includes(user.role)) {
      return <Navigate to="/" replace />;
    }
  }

  // ✅ All checks passed
  return <>{children}</>;
};

export default ProtectedRoute;
