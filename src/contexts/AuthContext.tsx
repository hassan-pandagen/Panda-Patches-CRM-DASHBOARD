import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { supabase } from '../services/supabaseClient';

import { UserRole } from '../types';

interface AuthContextType {
  user: any; // Consider defining a more specific type for user
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // ✅ Handle session and role fetching
  const handleSession = async (session: any) => {
    try {
      if (session?.user) {
        setUser(session.user);
        setIsAuthenticated(true);

        // Fetch role from user_profiles
        const { data, error } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error('Error fetching role:', error.message);
          setRole(null);
        } else {
          setRole((data?.role as UserRole) || null);
        }
      } else {
        setUser(null);
        setRole(null);
        setIsAuthenticated(false);
      }
    } catch (err) {
      console.error('Session handling error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ Initialize auth state once
  useEffect(() => {
    // Set loading to true initially. The listener will set it to false.
    setIsLoading(true);
    // ✅ Listen for login/logout changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        handleSession(session);
      }
    );

    // ✅ Proper cleanup (no return value)
    return () => {
      if (listener?.subscription) {
        listener.subscription.unsubscribe();
      }
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated,
        isLoading,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
