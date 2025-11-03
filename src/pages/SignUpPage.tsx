import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signUpUser } from '../services/authService';
import Spinner from '../components/ui/Spinner';
import PandaIcon from '../components/ui/PandaIcon';

const SignUpPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = await signUpUser(email, password);
      if (error) {
        setError(error.message);
      } else {
        // On successful sign-up, Supabase sends a confirmation email.
        // We can redirect the user to the login page with a message.
        navigate('/login', { state: { message: 'Sign-up successful! Please check your email to confirm your account.' } });
      }
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="w-full max-w-md p-8 space-y-6 bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl shadow-lg shadow-black/10">
        <div className="flex flex-col items-center">
            <PandaIcon />
            <h2 className="text-2xl font-bold text-center text-slate-50">Create an Account</h2>
            <p className="text-slate-400">Get started with Panda Patches CRM</p>
        </div>
        
        <form className="space-y-6" onSubmit={handleSignUp}>
          <div>
            <label htmlFor="email" className="block text-slate-300 font-medium tracking-wide mb-2 text-sm">
              Email Address
            </label>
            <div className="mt-1">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-slate-300 font-medium tracking-wide mb-2 text-sm">
              Password
            </label>
            <div className="mt-1">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
             <p className="mt-2 text-xs text-slate-500">Password must be at least 6 characters long.</p>
          </div>
          
          {error && <p className="text-sm text-red-400">{error}</p>}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center font-medium rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-black/10 px-4 py-2 disabled:opacity-50"
            >
              {loading ? <Spinner small /> : 'Sign Up'}
            </button>
          </div>
          <div className="text-center text-sm">
            <p className="text-slate-400">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-blue-400 hover:text-blue-300">
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SignUpPage;
