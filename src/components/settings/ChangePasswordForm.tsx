import React, { useState } from 'react';
import { updateMyPassword } from '../../services/authService';
import Spinner from '../ui/Spinner';
import GlassCard from '../ui/GlassCard';
import Button from '../ui/Button'; // Assuming you have this, otherwise use standard <button>
import { useToast } from '../../hooks/useToast'; // Assuming you use this hook

export const ChangePasswordForm: React.FC = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Use your toast hook if available, otherwise fallback to local error state
  const toast = useToast(); 

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("Error", "New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Error", "New password must be at least 6 characters long.");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await updateMyPassword(newPassword);
      if (error) throw error;

      toast.success("Success", "Password updated successfully!");
      setNewPassword('');
      setConfirmPassword('');
      
    } catch (err: any) {
      toast.error("Update Failed", err.message || "An unexpected error occurred.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <GlassCard>
      <div className="p-6">
        <h3 className="text-xl font-semibold text-slate-100 mb-4">Change Password</h3>
        <p className="text-slate-400 mb-6">
          Update your password to keep your account secure.
        </p>

        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-brand-orange focus:ring-1 focus:ring-brand-orange outline-none transition-colors placeholder-slate-600"
              placeholder="••••••••"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-brand-orange focus:ring-1 focus:ring-brand-orange outline-none transition-colors placeholder-slate-600"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="pt-4 flex justify-end">
            <Button 
              type="submit" 
              disabled={isSaving || !newPassword} 
              className="w-full sm:w-auto"
            >
              {isSaving ? <Spinner size="sm" /> : 'Update Password'}
            </Button>
          </div>
        </form>
      </div>
    </GlassCard>
  );
};