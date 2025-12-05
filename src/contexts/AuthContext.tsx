// src/contexts/AuthContext.tsx - SIMPLE & CLEAN

import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { supabase } from '../services/supabaseClient';
import { Session, User } from '@supabase/supabase-js';
import { UserProfile, GlobalSettings } from '../types';
import { logger } from '../services/logger'; // ✅ UPGRADE 6: Logger service

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: string | null;
  permissions: any | null;
  settings: GlobalSettings | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // 1. SAFETY TIMEOUT: Force stop loading after 2 seconds if Supabase hangs
    const safetyTimer = setTimeout(() => {
      if (mounted && isLoading) {
        logger.warn("[Auth Context] Auth check timed out. Forcing app to load.");
        setIsLoading(false);
      }
    }, 2000);

    // FETCH GLOBAL SETTINGS (Once per session)
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('*')
          .eq('id', 'global_settings')
          .maybeSingle();

        if (!mounted) return;

        if (error) {
          logger.error('[Auth Context] Error fetching settings', error);
        } else if (data) {
          setSettings(data);
        }
      } catch (error) {
        logger.error('[Auth Context] Unexpected error fetching settings', error);
      }
    };

    const fetchUserProfile = async (currentUser: User) => {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', currentUser.id)
          .maybeSingle(); // Use maybeSingle to avoid 406 errors on empty results

        if (!mounted) return;

        if (error) {
          logger.error('[Auth Context] Error fetching profile', error);
          // If DB error, assume no profile
          setProfile(null);
        } else if (data) {
          setProfile(data);
        } else {
          // User exists in Auth but NOT in DB (Orphan). Sign them out to fix state.
          logger.warn('[Auth Context] User found in Auth but no Profile in DB. Signing out.');
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      } catch (error) {
        logger.error('[Auth Context] Unexpected auth error', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    // 2. INITIAL CHECK
    // Fetch settings immediately (independent of auth state)
    fetchSettings();

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        fetchUserProfile(session.user);
      } else {
        setIsLoading(false);
      }
    }).catch(err => {
      logger.error("[Auth Context] Session check failed", err);
      if (mounted) setIsLoading(false);
    });

    // 3. LISTEN FOR CHANGES
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Only fetch profile if we don't have it yet or if user changed
        fetchUserProfile(session.user);
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setIsLoading(false);
  };

  const value = {
    session,
    user,
    profile,
    role: profile?.role || null,
    permissions: profile?.permissions || null,
    settings,
    isLoading,
    isAuthenticated: !!user,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};