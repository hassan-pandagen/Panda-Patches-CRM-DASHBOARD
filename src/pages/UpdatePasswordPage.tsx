import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateUserPassword } from '../services/authService';
import Spinner from '../components/ui/Spinner';
import PandaIcon from '../components/ui/PandaIcon';

const UpdatePasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isTokenValid, setIsTokenValid] = useState(false);

  useEffect(() => {
    // The presence of the 'access_token' in the URL hash indicates the user
    // has arrived from a password reset link.
    if (window.location.hash.includes('access_token')) {
      setIsTokenValid(true);
    } else {
      setError('Invalid or expired password reset link. Please request a new one.');
    }
  }, []);

  const handlePasswordUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isTokenValid) return;

    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const { error } = await updateUserPassword(password);
      if (error) {
        setError(error.message);
      } else {
        setMessage('Your password has been updated successfully! You will be redirected to login shortly.');
        setTimeout(() => navigate('/login'), 3000);
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
            <h2 className="text-2xl font-bold text-center text-slate-50">Set New Password</h2>
        </div>

        {isTokenValid && (
            <form className="space-y-6" onSubmit={handlePasswordUpdate}>
            <div>
                <label htmlFor="password" className="block text-slate-300 font-medium tracking-wide mb-2 text-sm">
                New Password
                </label>
                <div className="mt-1">
                <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                </div>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            {message && <p className="text-sm text-green-400">{message}</p>}

            <div>
                <button type="submit" disabled={loading || !!message} className="w-full inline-flex items-center justify-center font-medium rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50 bg-[#6366F1] hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.2)] px-4 py-2 disabled:opacity-50">
                {loading ? <Spinner small /> : 'Update Password'}
                </button>
            </div>
            </form>
        )}
        {!isTokenValid && error && <p className="text-center text-red-400">{error}</p>}
      </div>
    </div>
  );
};

export default UpdatePasswordPage;
