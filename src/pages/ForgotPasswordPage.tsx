
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from '../services/authService';
import Spinner from '../components/ui/Spinner';
import PandaIcon from '../components/ui/PandaIcon';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePasswordReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const { error } = await sendPasswordResetEmail(email);
      if (error) {
        setError(error.message);
      } else {
        setMessage('If an account with that email exists, a password reset link has been sent.');
      }
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0A0A0F]">
      <div className="w-full max-w-md p-8 space-y-6 bg-[#1A1B23] border border-[#252836] rounded-2xl shadow-[0_0_20px_rgba(99,102,241,0.1)]">
        <div className="flex flex-col items-center">
            <PandaIcon />
            <h2 className="text-2xl font-bold text-center text-slate-50">Reset Password</h2>
            <p className="text-slate-400">Enter your email to receive a reset link.</p>
        </div>

        <form className="space-y-6" onSubmit={handlePasswordReset}>
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

          {error && <p className="text-sm text-red-400">{error}</p>}
          {message && <p className="text-sm text-green-400">{message}</p>}

          <div>
            <button
              type="submit"
              disabled={loading || !!message}
              className="w-full inline-flex items-center justify-center font-medium rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50 bg-[#6366F1] hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.2)] px-4 py-2 disabled:opacity-50"
            >
              {loading ? <Spinner small /> : 'Send Reset Link'}
            </button>
          </div>
        </form>

        <div className="text-sm text-center">
          <Link to="/login" className="font-medium text-blue-400 hover:text-blue-300">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
