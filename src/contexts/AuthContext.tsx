import React, { createContext, useState, useEffect, useContext, ReactNode, useMemo } from "react";
import { Session, AuthChangeEvent } from "@supabase/supabase-js";
import { onAuthStateChange, getSession } from "../services/authService";
import { getUserProfile } from "../services/userService";
import { UserProfile as AppUser, UserRole } from "../types";

interface AuthContextType {
  user: AppUser | null;
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
});

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (session: Session | null) => {
    if (!session?.user) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      let userProfile = await getUserProfile(session.user.id);

      // Retry once if not found (handles just-created user)
      if (!userProfile) {
        await new Promise((r) => setTimeout(r, 800));
        userProfile = await getUserProfile(session.user.id);
      }

      const finalUser: AppUser = {
        ...session.user,
        email: session.user.email ?? "",
        role: (userProfile?.role as UserRole) || UserRole.AGENT,
      };

      setUser(finalUser);
    } catch (err) {
      console.error("Error loading profile:", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const { data: listener } = onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setSession(session);
        loadProfile(session);
      }
    );
    
    // Initial check
    getSession().then(session => loadProfile(session));
    
    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ user, session, loading }), [user, session, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
