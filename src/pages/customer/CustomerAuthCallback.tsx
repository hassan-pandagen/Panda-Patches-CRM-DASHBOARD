import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const CustomerAuthCallback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      // Wait for Supabase to exchange the token from the URL hash
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        navigate('/customer/login', { replace: true });
        return;
      }

      const userId = session.user.id;

      // Check if this is a staff member — if so, bounce to CRM login
      const { data: staffProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (staffProfile) {
        navigate('/login', { replace: true });
        return;
      }

      // Check if they came from an invite link (no password set yet)
      // Supabase sets amr to 'link' for invite/magiclink flows
      const amr = session.user.amr as any;
      const isInviteFlow = Array.isArray(amr)
        ? amr.some((a: any) => a.method === 'invite')
        : false;

      if (isInviteFlow) {
        navigate('/customer/set-password', { replace: true });
        return;
      }

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
