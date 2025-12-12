import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query'; 
import { supabase } from '../services/supabaseClient';
import { UserRole, UserPermissions } from '../types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  permissions: UserPermissions | null;
  isLoading: boolean;
  error: Error | null;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  settings?: { logo_url?: string } | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 👇 ADD YOUR ADMIN EMAILS HERE
const SUPER_ADMIN_EMAILS = [
  'hello@pandapatches.com',
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Auth State (Still managed manually because Supabase is real-time)
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const queryClient = useQueryClient();

  // 2. Initialize Session
  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
        }
      } catch (err) {
        console.error('Auth init error:', err);
        // Safe Cleanup
        localStorage.clear();
        sessionStorage.clear();
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (mounted) {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setAuthLoading(false);
        // Clear React Query cache on logout
        if (!newSession) {
          queryClient.clear(); 
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  // 3. INDUSTRY STANDARD: Fetch Profile with React Query
  // This automatically runs when 'user.id' exists.
  const { data: profile, isLoading: isProfileLoading, error: profileError } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    // Only run this query if we have a user
    enabled: !!user?.id, 
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false,
  });

  // ✅ FIX: Fetch global settings with React Query
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('logo_url')
        .eq('id', 'global_settings')
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 60, // 1 hour, settings don't change often
    retry: 1,
  });

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      queryClient.clear(); 
      setSession(null);
      setUser(null);
    }
  };

  const refreshSession = async () => {
    await supabase.auth.refreshSession();
  };

  // 4. Derived State 
  const role = profile?.role ?? null;
  const permissions = profile?.permissions ?? null;
  
  // Combined loading state
  const isLoading = authLoading || (!!user && isProfileLoading);
  const error = (profileError as Error) || null;

  const value: AuthContextType = {
    user,
    session,
    role,
    permissions,
    isLoading,
    error,
    signOut,
    refreshSession,
    settings,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};