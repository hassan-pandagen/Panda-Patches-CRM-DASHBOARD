import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const CustomerAuthCallback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      // Supabase handles the token exchange from the URL automatically
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        navigate('/customer/login', { replace: true });
        return;
      }

      // Redirect to customer dashboard
      navigate('/customer/dashboard', { replace: true });
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white text-lg font-medium">Signing you in...</p>
        <p className="text-slate-400 text-sm mt-2">Just a moment</p>
      </div>
    </div>
  );
};

export default CustomerAuthCallback;
