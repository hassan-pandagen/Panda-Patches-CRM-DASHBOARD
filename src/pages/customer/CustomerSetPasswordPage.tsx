import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import Spinner from '../../components/ui/Spinner';
import SpotlightCard from '../../components/ui/SpotlightCard';
import { BrandLogo } from '../../components/ui/BrandLogo';
import TawkToWidget from '../../components/customer/TawkToWidget';

// Prevent iOS input auto-zoom (font must be >= 16px)
const inputFont = { fontSize: '16px' } as const;

const CustomerSetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    // Supabase exchanges the invite token in the URL for a session automatically.
    // Give it a tick, then confirm we have one. If not, bounce to login.
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        // Also listen once in case the token is still being processed
        const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
          if (s?.user) {
            setEmail(s.user.email ?? null);
            setCheckingSession(false);
            sub.subscription.unsubscribe();
          }
        });
        // Fallback: if no event after 3s, send them to login
        setTimeout(() => {
          supabase.auth.getSession().then(({ data }) => {
            if (!data.session) {
              sub.subscription.unsubscribe();
              navigate('/customer/login', { replace: true });
            }
          });
        }, 3000);
        return;
      }
      setEmail(session.user.email ?? null);
      setCheckingSession(false);
    };
    run();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // Set password
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) throw pwError;

      // Flip the password_set flag in app_metadata via edge function
      // (app_metadata can only be modified server-side with service role)
      const { error: flagError } = await supabase.functions.invoke('mark-password-set', {});
      if (flagError) {
        // Non-fatal — password is set, flag just wasn't flipped
        // Next login will work, and the flag will get set then.
        // But log it for debugging.
        console.warn('[set-password] Could not flip password_set flag:', flagError.message);
      }

      // Refresh session so the JWT picks up new app_metadata
      await supabase.auth.refreshSession();

      navigate('/customer/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Could not set your password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white text-lg font-medium">Verifying your link…</p>
        </div>
      </div>
    );
  }

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
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Set Your Password</h2>
            <p className="mt-2 text-sm text-slate-400">
              Almost done! Pick a password to finish setting up your portal.
            </p>
            {email && (
              <p className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-emerald-300 font-medium">{email}</span>
              </p>
            )}
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"></div>
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 ml-1">
                New Password
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
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
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

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 ml-1">
                Confirm Password
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-500 group-focus-within:text-brand-orange transition-colors" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  style={inputFont}
                  className="block w-full pl-10 pr-3 py-4 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !password || !confirm}
              className="group relative w-full flex justify-center py-4 px-4 border border-transparent rounded-xl text-white bg-brand-orange hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-orange disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold shadow-lg shadow-brand-orange/20"
            >
              {loading ? (
                <div className="flex items-center gap-2"><Spinner small /><span>Setting password…</span></div>
              ) : (
                <div className="flex items-center gap-2"><span>Continue to Portal</span><ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></div>
              )}
            </button>
          </form>
        </SpotlightCard>

        <p className="text-center text-xs text-slate-500">
          Need help? Email <span className="text-slate-400">hello@pandapatches.com</span>
        </p>
      </div>

      {/* Live chat available during password setup too */}
      <TawkToWidget name={undefined} email={email || undefined} />
    </div>
  );
};

export default CustomerSetPasswordPage;
