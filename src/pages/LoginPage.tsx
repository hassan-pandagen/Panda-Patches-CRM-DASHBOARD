import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { logger } from '../services/logger';
import { useAuth } from '../contexts/AuthContext';
import Spinner from '../components/ui/Spinner';
import SpotlightCard from '../components/ui/SpotlightCard';
import { Eye, EyeOff, Lock, Mail, ArrowRight } from 'lucide-react';
import { BrandLogo } from '../components/ui/BrandLogo';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'reset'>('login');

  // Redirect logic
  const state = location.state as { from?: { pathname: string } } | null;
  const from = state?.from?.pathname || '/';

  // Listen for password recovery event from Supabase
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset');
        setSuccess('You can now set a new password.');
        setError(null);
      }
    });

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Make error messages user-friendly
        setError(error.message.includes('Invalid login credentials') ? 'Invalid email or password.' : error.message);
      } else {
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      logger.error('Login Error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordResetRequest = async () => {
    if (!email) {
      setError('Please enter your email address to reset your password.');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin, // Redirect back to the login page
      });
      if (error) throw error;
      setSuccess('Password reset link has been sent to your email.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setSuccess('Password updated successfully! You can now log in.');
      setMode('login'); // Switch back to login mode
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    // MAIN CONTAINER: Dark background with overflow hidden for the blobs
    <div className="min-h-screen bg-slate-900 relative flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
      
      {/* 2. BACKGROUND ANIMATIONS (Using your index.css classes) */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-brand-orange rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>

      <div className="max-w-md w-full space-y-8 relative z-10">
        
        {/* 3. SPOTLIGHTCARD WRAPPER */}
        <SpotlightCard className="p-8">
          
          {/* HEADER: Logo & Welcome Text */}
          <div className="text-center">
            <div className="mb-8 flex justify-center">
               <BrandLogo className="h-20 w-auto" variant="dark" />
            </div>
            
            {mode === 'login' && (
              <>
                <h2 className="text-3xl font-bold text-white tracking-tight">Welcome Back</h2>
                <p className="mt-2 text-sm text-slate-400">Sign in to your CRM dashboard</p>
              </>
            )}
            {mode === 'reset' && (
              <>
                <h2 className="text-3xl font-bold text-white tracking-tight">Set New Password</h2>
                <p className="mt-2 text-sm text-slate-400">Enter your new password below.</p>
              </>
            )}
          </div>
          <div className="mt-8">

          {/* ERROR MESSAGE */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 animate-pulse">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          {/* SUCCESS MESSAGE */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <p className="text-sm text-green-200">{success}</p>
            </div>
          )}

          {mode === 'login' ? (
            <form className="space-y-6" onSubmit={handleLogin}>
              {/* EMAIL INPUT */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 ml-1">
                  Email Address
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-500 group-focus-within:text-brand-orange transition-colors" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="hello@pandapatches.com"
                    className="block w-full pl-10 pr-3 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all duration-200 focus-ring"
                  />
                </div>
              </div>

              {/* PASSWORD INPUT WITH EYE ICON */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 ml-1">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-500 group-focus-within:text-brand-orange transition-colors" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="block w-full pl-10 pr-10 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all duration-200 focus-ring"
                  />
                  {/* Toggle Password Visibility */}
                   <button
                     type="button"
                     onClick={() => setShowPassword(!showPassword)}
                     className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white transition-colors focus:outline-none focus-ring rounded"
                     aria-label={showPassword ? "Hide password" : "Show password"}
                   >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="text-right">
                <button type="button" onClick={handlePasswordResetRequest} className="text-xs font-medium text-slate-400 hover:text-brand-orange transition-colors">
                  Forgot Password?
                </button>
              </div>

              {/* SUBMIT BUTTON */}
               <button
                 type="submit"
                 disabled={loading || !email || !password}
                 className="group relative w-full flex justify-center py-3 px-4 border border-transparent rounded-xl text-white bg-brand-orange hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-orange disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold shadow-lg shadow-brand-orange/20 hover:shadow-brand-orange/40 focus-ring"
               >
                {loading ? (
                  <div className="flex items-center gap-2"><Spinner size="sm" /><span>Signing in...</span></div>
                ) : (
                  <div className="flex items-center gap-2"><span>Sign In</span><ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></div>
                )}
              </button>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handlePasswordUpdate}>
              {/* NEW PASSWORD INPUT */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 ml-1">New Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-slate-500 group-focus-within:text-brand-orange transition-colors" /></div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="Enter new password"
                    className="block w-full pl-10 pr-10 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all duration-200"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white transition-colors focus:outline-none">
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* CONFIRM PASSWORD INPUT */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 ml-1">Confirm New Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-slate-500 group-focus-within:text-brand-orange transition-colors" /></div>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Confirm new password"
                    className="block w-full pl-10 pr-3 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all duration-200"
                  />
                </div>
              </div>

              {/* SUBMIT BUTTON */}
              <button
                type="submit"
                disabled={loading || !newPassword || !confirmPassword}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent rounded-xl text-white bg-brand-orange hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-orange disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold shadow-lg shadow-brand-orange/20 hover:shadow-brand-orange/40"
              >
                {loading ? (
                  <div className="flex items-center gap-2"><Spinner size="sm" /><span>Updating...</span></div>
                ) : (
                  <div className="flex items-center gap-2"><span>Update Password</span><ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></div>
                )}
              </button>
            </form>
          )}
          </div>
          </SpotlightCard>

          {/* Footer Text */}
        <p className="text-center text-xs text-slate-500 mt-8">
          &copy; {new Date().getFullYear()} Panda Patches. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;