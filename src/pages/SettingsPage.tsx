import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { logger } from '../services/logger';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { queryKeys } from '../constants/queryKeys';
import FileUploadSection from '../components/orders/FileUpload';
import Button from '../components/ui/Button';
import GlassCard from '../components/ui/GlassCard';
import { ChangePasswordForm } from '../components/settings/ChangePasswordForm';
import Spinner from '../components/ui/Spinner';

// ✅ FIX: Use upsert() instead of update()
const updateSettings = async (updates: { logo_url: string }) => {
  const { data, error } = await supabase
    .from('settings')
    .upsert({ id: 'global_settings', ...updates }, { onConflict: 'id' }) 
    .select()
    .single();

  if (error) throw error;
  return data;
};

const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast(); // ✅ FIX: Destructure the toast object
  const { role, settings } = useAuth();
  
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);

  // ✅ Load initial logo URL from context
  useEffect(() => {
    if (settings?.logo_url) {
      setLogoUrl(settings.logo_url);
    }
  }, [settings]);

  // ✅ FIX: Proper mutation with YOUR custom toast system
  const { mutate: saveSettings, isLoading: isSaving } = useMutation({
    mutationFn: updateSettings,
    onSuccess: (updatedData) => {
      toast.success('Settings Saved');
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.profile() });
      setIsDirty(false);
      if (updatedData?.logo_url) {
        setLogoUrl(updatedData.logo_url);
      }
    },
    onError: (error: any) => {
      logger.error('Save error:', error);
      toast.error('Save Failed', error.message || 'Could not save settings');
    },
  });

  const handleLogoUpload = (newUrls: string[]) => {
    const newUrl = newUrls[0] || '';
    setLogoUrl(newUrl);
    setIsDirty(true);
  };

  const handleSave = () => {
    if (!isDirty) {
      toast.info('No Changes', 'No changes to save.');
      return;
    }
    console.log('Saving logo URL:', logoUrl);
    saveSettings({ logo_url: logoUrl });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8 animate-fadeIn">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white">Settings</h2>
        <p className="text-slate-400 mt-2">Manage application preferences.</p>
      </div>

      {role === 'ADMIN' && (
        <GlassCard>
          <div className="p-6">
            <h3 className="text-xl font-semibold text-slate-100 mb-4">Branding</h3>
            <p className="text-slate-400 mb-6">
              Upload your company logo. This will be displayed on the sidebar.
            </p>
            
            <FileUploadSection
              title="Company Logo"
              bucketName="logos"
              folderPath="public"
              urls={logoUrl ? [logoUrl] : []}
              onUrlsChange={handleLogoUpload}
            />

            <div className="mt-8 pt-6 border-t border-slate-700/50 flex justify-end">
              <Button 
                onClick={handleSave} 
                disabled={!isDirty || isSaving}
                className="w-full sm:w-auto"
              >
                {isSaving ? <Spinner size="sm" /> : 'Save Changes'}
              </Button>
            </div>
          </div>
        </GlassCard>
      )}
      
      <ChangePasswordForm />
    </div>
  );
};

export default SettingsPage;