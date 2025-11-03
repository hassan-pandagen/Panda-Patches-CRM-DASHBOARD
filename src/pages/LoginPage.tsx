import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { signInUser } from '../services/authService';
import Spinner from '../components/ui/Spinner';
import PandaIcon from '../components/ui/PandaIcon';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Determine where to redirect after login. Defaults to the dashboard.
  const from = location.state?.from?.pathname || '/';

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    
    try {
      const { error } = await signInUser(email, password);
      if (error) {
        // Provide a more user-friendly error message for invalid credentials.
        if (error.message.includes('Invalid login credentials')) {
            setError('Invalid credentials. Please check your email and password.');
        } else {
            setError(error.message);
        }
      } else {
        // Redirect to the page the user was trying to access, or the dashboard.
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check for a message passed from the sign-up page
    const locationState = location.state as { message?: string };
    if (locationState?.message) {
      setMessage(locationState.message);
      // Clear the message from location state so it doesn't reappear on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 shadow-xl">
          {/* Header with logo */}
          <div className="text-center mb-8">
            <PandaIcon />
            <h2 className="text-3xl font-bold text-white mt-4">Panda Patches CRM</h2>
            <p className="text-slate-400 mt-2">Invitation-Only Access</p>
          </div>

          {message && (
              <div className="p-3 text-sm text-center text-green-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  {message}
              </div>
          )}
          {error && <p className="p-3 text-sm text-center text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg">{error}</p>}

          {/* Login form */}
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your email"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2 pr-10 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-blue-400">
                  {showPassword ? 
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg> : 
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.58 0 00-4.512 1.074l-1.78-1.781zM9 4.804A7.968 7.968 0 0110 5c4.478 0 8.268 2.943 9.542 7a10.014 10.014 0 01-1.549 2.486l-1.473-1.473A3.98 3.98 0 0014 10a4 4 0 10-4.476-3.975L9 4.804z" clipRule="evenodd" /></svg>
                  }
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50"
            >
              {loading ? <Spinner small /> : 'Sign in'}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <Link to="/forgot-password" className="text-slate-400 hover:text-slate-300 text-sm">
              Forgot your password?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
