import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { updateMyPassword } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Lock, Eye, EyeOff, Save, CheckCircle, AlertCircle } from 'lucide-react';
import Spinner from '../components/ui/Spinner';

// --- CONSTANTS ---
const LOGO_SETTING_KEY = 'company_logo';

// --- COMPONENT: LOGO UPLOADER (ADMIN ONLY) ---
const LogoUploader: React.FC = () => {
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: currentLogoUrl, isLoading } = useQuery({
    queryKey: [LOGO_SETTING_KEY],
    queryFn: async () => {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('id', LOGO_SETTING_KEY)
        .maybeSingle();
      return data?.value as string | null;
    },
  });

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      // 1. Upload to Supabase Storage 'logos' bucket
      const fileExt = file.name.split('.').pop();
      const fileName = `company-logo-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw new Error(uploadError.message);

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(filePath);

      // 3. Save URL to Settings Table
      const { error: dbError } = await supabase
        .from('settings')
        .upsert({ id: LOGO_SETTING_KEY, value: publicUrl });

      if (dbError) throw new Error(dbError.message);

      return publicUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LOGO_SETTING_KEY] });
      queryClient.invalidateQueries({ queryKey: ['company_logo'] }); // Update Sidebar immediately
      setUploadError(null);
    },
    onError: (error: Error) => {
      setUploadError(error.message);
    },
    onSettled: () => setIsUploading(false),
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setIsUploading(true);
      mutation.mutate(acceptedFiles[0]);
    }
  }, [mutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpeg', '.jpg', '.svg', '.webp'] },
    multiple: false,
  });

  return (
    <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl p-8 mb-8">
      <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
        <UploadCloud className="text-brand-orange w-6 h-6" />
        <h3 className="text-xl font-bold text-white">Company Branding</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 group ${
            isDragActive 
              ? 'border-brand-orange bg-brand-orange/10' 
              : 'border-slate-600 hover:border-brand-orange hover:bg-slate-700/50'
          }`}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center justify-center gap-4">
            <div className={`p-4 rounded-full bg-slate-900 shadow-inner ${isDragActive ? 'text-brand-orange' : 'text-slate-400 group-hover:text-brand-orange'}`}>
              <UploadCloud size={32} />
            </div>
            <div>
              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Spinner size="sm" />
                  <p className="text-slate-300 font-medium">Uploading...</p>
                </div>
              ) : (
                <>
                  <p className="text-slate-200 font-medium text-lg mb-1">Click to upload logo</p>
                  <p className="text-slate-400 text-sm">or drag and drop SVG, PNG, JPG</p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center p-6 bg-slate-900/50 rounded-xl border border-white/5">
          <p className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">Current Preview</p>
          {isLoading ? <Spinner /> : (
            <div className="relative group">
               <img 
                 src={currentLogoUrl || '/logo.svg'} 
                 alt="Current Logo" 
                 className="h-24 object-contain drop-shadow-lg transition-transform duration-300 group-hover:scale-105" 
               />
            </div>
          )}
        </div>
      </div>
      {uploadError && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-300 text-sm">
          <AlertCircle size={16} />
          {uploadError}
        </div>
      )}
    </div>
  );
};

// --- COMPONENT: PASSWORD CHANGER (EVERYONE) ---
const ChangePasswordForm: React.FC = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters long.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await updateMyPassword(newPassword);
      if (error) throw error;
      
      setMessage({ type: 'success', text: 'Password updated successfully!' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl p-8">
      <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
        <Lock className="text-brand-orange w-6 h-6" />
        <h3 className="text-xl font-bold text-white">Security Settings</h3>
      </div>

      <form onSubmit={handleUpdatePassword} className="max-w-xl">
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">New Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-4 pr-10 py-3 bg-slate-900/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange text-white placeholder-slate-500 transition-all"
                placeholder="Min. 6 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-slate-500 hover:text-white"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange text-white placeholder-slate-500 transition-all"
              placeholder="Re-enter new password"
            />
          </div>

          {message && (
            <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
              message.type === 'success' ? 'bg-green-500/10 text-green-300 border border-green-500/20' : 'bg-red-500/10 text-red-300 border border-red-500/20'
            }`}>
              {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !newPassword}
            className="flex items-center gap-2 px-6 py-3 bg-brand-orange hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-brand-orange/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Spinner size="sm" /> : <Save size={18} />}
            Update Password
          </button>
        </div>
      </form>
    </div>
  );
};

// --- MAIN PAGE COMPONENT ---
const SettingsPage: React.FC = () => {
  const { role } = useAuth();

  return (
    <div className="max-w-5xl mx-auto p-6 animate-fade-in">
      <h2 className="text-3xl font-bold text-white mb-8 tracking-tight">Account Settings</h2>
      
      {/* Only Admins can see the Logo Uploader */}
      {role === UserRole.ADMIN && (
        <LogoUploader />
      )}

      {/* Everyone can see the Password Changer */}
      <ChangePasswordForm />
    </div>
  );
};

export default SettingsPage;