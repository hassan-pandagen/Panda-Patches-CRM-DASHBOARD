import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, ArrowRight, MailCheck } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import Spinner from '../../components/ui/Spinner';
import SpotlightCard from '../../components/ui/SpotlightCard';
import { BrandLogo } from '../../components/ui/BrandLogo';

const inputFont = { fontSize: '16px' } as const; // prevent iOS auto-zoom

const CustomerLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    // If URL hash contains a recovery/invite token, route to set-password BEFORE
    // the session check redirects to dashboard. Supabase auto-exchanges the token.
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const isRecovery =
      hash.includes('type=recovery') ||
      hash.includes('type=invite') ||
      search.includes('type=recovery') ||
      search.includes('type=invite');

    if (isRecovery) {
      // Preserve the hash so /customer/set-password can pick up the session
      navigate('/customer/set-password' + hash, { replace: true });
      return;
    }

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // If they're logged in but their password isn't set yet, force set-password
        const passwordSet = session.user.app_metadata?.password_set === true;
        if (!passwordSet) {
          navigate('/customer/set-password', { replace: true });
          return;
        }
        const { data } = await supabase
          .from('customer_profiles')
          .select('id')
          .eq('id', session.user.id)
          .maybeSingle();
        if (data) navigate('/customer/dashboard', { replace: true });
      }
    };
    check();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message.includes('Invalid login credentials')
          ? 'Invalid email or password.'
          : error.message);
        return;
      }
      navigate('/customer/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Use our branded edge function instead of Supabase's default email
      const { data, error } = await supabase.functions.invoke('invite-customer', {
        body: {
          email: email.trim().toLowerCase(),
          customer_name: 'Customer',
          order_number: 'N/A',
          portal_url: 'https://login.pandapatches.com',
          mode: 'reset_password',
        },
      });
      if (error || data?.error) {
        // Don't reveal whether the email exists — show generic success
        // (this is a security best practice for forgot-password flows)
        console.warn('[forgot] invite-customer error:', data?.error || error?.message);
      }
      setResetSent(true);
    } catch (err: any) {
      // Same — show success even on error to avoid email enumeration
      console.warn('[forgot] error:', err.message);
      setResetSent(true);
    } finally {
      setLoading(false);
    }
  };

  const switchTo = (next: 'login' | 'forgot') => {
    setMode(next);
    setError('');
    setResetSent(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 relative flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-brand-orange rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>

      <div className="max-w-md w-full space-y-6 relative z-10">
        <SpotlightCard className="p-6 sm:p-8">
          <div className="text-center">
            <div className="mb-6 flex justify-center">
              <BrandLogo className="h-16 sm:h-20 w-auto" variant="dark" />
            </div>
            {mode === 'login' && (
              <>
                <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Customer Portal</h2>
                <p className="mt-2 text-sm text-slate-400">Sign in to track your orders</p>
              </>
            )}
            {mode === 'forgot' && !resetSent && (
              <>
                <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Reset Password</h2>
                <p className="mt-2 text-sm text-slate-400">We'll email you a link to set a new password.</p>
              </>
            )}
            {mode === 'forgot' && resetSent && (
              <>
                <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Check Your Email</h2>
                <p className="mt-2 text-sm text-slate-400">We sent a password reset link to your inbox.</p>
              </>
            )}
          </div>

          <div className="mt-6">
            {error && (
              <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"></div>
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}

            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-5">
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
                      placeholder="your@email.com"
                      style={inputFont}
                      className="block w-full pl-10 pr-3 py-4 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 ml-1">
                    Password
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-500 group-focus-within:text-brand-orange transition-colors" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      style={inputFont}
                      className="block w-full pl-10 pr-12 py-4 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => switchTo('forgot')}
                    className="text-sm font-medium text-slate-400 hover:text-brand-orange transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="group relative w-full flex justify-center py-4 px-4 border border-transparent rounded-xl text-white bg-brand-orange hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-orange disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold shadow-lg shadow-brand-orange/20"
                >
                  {loading ? (
                    <div className="flex items-center gap-2"><Spinner small /><span>Signing in…</span></div>
                  ) : (
                    <div className="flex items-center gap-2"><span>Sign In</span><ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></div>
                  )}
                </button>

                <p className="text-center text-xs text-slate-500 pt-2">
                  First time here? Check your order confirmation email for your portal invite.
                </p>
              </form>
            )}

            {mode === 'forgot' && !resetSent && (
              <form onSubmit={handleForgot} className="space-y-5">
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
                      placeholder="your@email.com"
                      style={inputFont}
                      className="block w-full pl-10 pr-3 py-4 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="group relative w-full flex justify-center py-4 px-4 border border-transparent rounded-xl text-white bg-brand-orange hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-orange disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold shadow-lg shadow-brand-orange/20"
                >
                  {loading ? (
                    <div className="flex items-center gap-2"><Spinner small /><span>Sending…</span></div>
                  ) : (
                    <div className="flex items-center gap-2"><span>Send Reset Link</span><ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></div>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => switchTo('login')}
                  className="w-full text-center text-sm font-medium text-slate-400 hover:text-brand-orange transition-colors"
                >
                  Back to sign in
                </button>
              </form>
            )}

            {mode === 'forgot' && resetSent && (
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MailCheck className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-slate-300 mb-2">
                  We sent a reset link to <strong className="text-white break-all">{email}</strong>
                </p>
                <p className="text-sm text-slate-500 mb-6">
                  Click the link in the email to set a new password.
                </p>
                <button
                  onClick={() => switchTo('login')}
                  className="text-sm font-medium text-brand-orange hover:text-orange-400 transition-colors"
                >
                  Back to sign in
                </button>
              </div>
            )}
          </div>
        </SpotlightCard>

        <p className="text-center text-xs text-slate-500">
          Need help? Email <span className="text-slate-400">hello@pandapatches.com</span>
        </p>
      </div>
    </div>
  );
};

export default CustomerLoginPage;
