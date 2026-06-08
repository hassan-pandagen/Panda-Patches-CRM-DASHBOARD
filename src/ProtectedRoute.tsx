// src/ProtectedRoute.tsx - guards CRM routes against unauthenticated users AND customers
import * as React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { supabase } from './services/supabaseClient';
import AppLoader from './components/ui/AppLoader';

const ProtectedRoute: React.FC = () => {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const [isCustomer, setIsCustomer] = React.useState<boolean | null>(null);

  // Check if the logged-in user is a customer (exists in customer_profiles, NOT in user_profiles)
  React.useEffect(() => {
    if (!user) {
      setIsCustomer(null);
      return;
    }
    let cancelled = false;
    (async () => {
      // Check both tables in parallel
      const [staff, customer] = await Promise.all([
        supabase.from('user_profiles').select('id').eq('id', user.id).maybeSingle(),
        supabase.from('customer_profiles').select('id').eq('id', user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      // Customer = exists in customer_profiles AND NOT in user_profiles
      setIsCustomer(!staff.data && !!customer.data);
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (isLoading || (user && isCustomer === null)) {
    return <AppLoader />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Customer logged into the CRM by mistake — the customer portal now lives on the
  // marketing website, so send them there (external redirect, not a CRM route).
  if (isCustomer) {
    if (typeof window !== 'undefined') {
      window.location.href = 'https://pandapatches.com/login';
    }
    return <AppLoader />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
