// src/contexts/AuthContext.tsx
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const queryClient = useQueryClient();

  // 1. Initialize Session
  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error; // This error we want to catch early
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
        }
      } catch (err) {
        console.error('Auth init error:', err);
        // Only clear storage if it's a critical session parsing error
        // localStorage.clear(); // ⚠️ Removed aggressive clear to prevent logout loops on network error
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

  // 2. Fetch Profile (FIXED: Added retries and safety checks)
  const { data: profile, isLoading: isProfileLoading, error: profileError } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error, status } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      
      // ✅ FIX: Ignore 406 errors (happens when row is missing but RLS allows select)
      if (error && status !== 406) {
        throw error;
      }
      
      return data;
    },
    enabled: !!user?.id, 
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2, // ✅ FIX: Retry twice on network failure before crashing
    refetchOnWindowFocus: false, // Don't spam DB when tabbing back
  });

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      queryClient.clear(); 
      setSession(null);
      setUser(null);
      localStorage.clear(); // Safe to clear on explicit sign out
    }
  };

  const refreshSession = async () => {
    await supabase.auth.refreshSession();
  };

  const role = profile?.role ?? null;
  const permissions = profile?.permissions ?? null;
  
  const isLoading = authLoading || (!!user && isProfileLoading);
  // ✅ FIX: Only consider it a hard error if profile fails AND we aren't loading
  const error = !isLoading ? (profileError as Error) : null;

  const value: AuthContextType = {
    user,
    session,
    role,
    permissions,
    isLoading,
    error,
    signOut,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}