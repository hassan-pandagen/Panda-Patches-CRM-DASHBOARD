import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
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
    // Add your specific login email here if different
];

// Helper: Timeout promise to prevent infinite loading
const timeoutPromise = (ms: number) => new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Request timed out')), ms)
);

// Helper: Fetch Profile with Admin Bypass
const fetchUserProfile = async (userId: string, userEmail?: string) => {
  // 🚀 1. SUPER ADMIN BYPASS
  // If this is you, return ADMIN immediately. No database waiting.
  if (userEmail && SUPER_ADMIN_EMAILS.includes(userEmail)) {
    console.log('👑 Super Admin detected:', userEmail);
    const adminPermissions: UserPermissions = {
      users_manage: true,
      orders_create: true,
      orders_view_all: true,
      orders_change_status: true,
      orders_edit_financials: true,
      orders_edit_production: true,
      orders_delete: true,
      reports_view_financials: true,
      shipping_view: true,
      attendance_clock_only: false  // ✅ FIXED: false so admin can see full attendance view
    };
    return { role: UserRole.ADMIN, permissions: adminPermissions };
  }

  try {
    console.log('🔍 Fetching user profile for:', userId);
    
    // 2. Normal Database Check for everyone else
    const dbRequest = supabase
      .from('user_profiles')
      .select('role, permissions')
      .eq('id', userId)
      .single();

    const { data, error } = await Promise.race([
      dbRequest,
      timeoutPromise(5000)
    ]) as any;

    if (error) {
      console.warn('⚠️ Profile fetch failed, using default role.', error.message);
      return { role: UserRole.SALES_AGENT, permissions: {} as UserPermissions };
    }

    return {
      role: (data?.role as UserRole) || UserRole.SALES_AGENT,
      permissions: (data?.permissions || {}) as UserPermissions
    };

  } catch (err) {
    console.error('⚠️ Profile fetch error/timeout:', err);
    return { role: UserRole.SALES_AGENT, permissions: {} as UserPermissions };
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [settings, setSettings] = useState<{ logo_url?: string } | null>(null);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        console.log('🔐 Initializing auth...');
        setIsLoading(true);

        // Get current session
        const { data: { session: currentSession }, error: sessionError } = 
          await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!mounted) return;

        // Fetch global settings
        const { data: settingsData } = await supabase
          .from('settings')
          .select('logo_url')
          .eq('id', 'global_settings')
          .single();

        if (mounted && settingsData) {
          setSettings(settingsData);
        }

        if (currentSession?.user) {
          console.log('✅ Session found:', currentSession.user.email);
          
          // Pass email to check for Super Admin status
          const userProfile = await fetchUserProfile(
            currentSession.user.id, 
            currentSession.user.email
          );
          
          if (mounted) {
            setSession(currentSession);
            setUser(currentSession.user);
            setRole(userProfile.role);
            setPermissions(userProfile.permissions);
          }
        } else {
          setSession(null);
          setUser(null);
          setRole(null);
        }
      } catch (error) {
        console.error('❌ Auth init error:', error);
        if (mounted) {
          setError(error instanceof Error ? error : new Error('Auth Init Failed'));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setRole(null);
          setPermissions(null);
        } else if (newSession?.user) {
          const userProfile = await fetchUserProfile(
            newSession.user.id, 
            newSession.user.email
          );
          if (mounted) {
            setSession(newSession);
            setUser(newSession.user);
            setRole(userProfile.role);
            setPermissions(userProfile.permissions);
          }
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshSession = async () => {
    try {
      const { data: { session: newSession }, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      if (newSession?.user) {
        const userProfile = await fetchUserProfile(
          newSession.user.id,
          newSession.user.email
        );
        setSession(newSession);
        setUser(newSession.user);
        setRole(userProfile.role);
        setPermissions(userProfile.permissions);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Refresh Failed'));
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
    setPermissions(null);
  };

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