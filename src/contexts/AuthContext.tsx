// src/contexts/AuthContext.tsx - SIMPLE & CLEAN

import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { supabase } from '../services/supabaseClient';
import { Session, User } from '@supabase/supabase-js';
import { UserProfile } from '../types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: string | null;
  permissions: any | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchUserProfile = async (currentUser: User) => {
      console.log('🔍 Fetching profile for:', currentUser.email);
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', currentUser.id)
          .single();

        if (!mounted) return;

        if (error) throw error;

        if (data) {
          console.log('✅ Profile found and set.');
          setProfile(data);
        }
      } catch (error) {
        console.error('❌ Error fetching user profile:', error);
        setProfile(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    console.log('🚀 AuthProvider: Starting');

    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('📊 Initial session:', session ? 'Found' : 'None');
      
      if (!mounted) return;

      if (session?.user) {
        setSession(session);
        setUser(session.user);
        fetchUserProfile(session.user);
      } else {
        console.log('❌ No session, stopping loading');
        setIsLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('🔔 Auth changed:', _event);
      if (!mounted) return;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchUserProfile(session.user);
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => {
      console.log('🧹 Cleanup');
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setIsLoading(false);
  };

  const value = {
    session,
    user,
    profile,
    role: profile?.role || null,
    permissions: profile?.permissions || null,
    isLoading,
    isAuthenticated: !!user,
    signOut,
  };

  console.log('📦 Context:', { isLoading, hasUser: !!user, hasProfile: !!profile, role: profile?.role });

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};