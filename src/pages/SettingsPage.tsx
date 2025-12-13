import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabaseClient";
import { logger } from "../services/logger";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { queryKeys } from "../constants/queryKeys";
import FileUploadSection from "../components/orders/FileUpload";
import Button from "../components/ui/Button";
import SpotlightCard from "../components/ui/SpotlightCard";
import { ChangePasswordForm } from "../components/settings/ChangePasswordForm";
import Spinner from "../components/ui/Spinner";
import { CheckCircle, X } from "lucide-react";

// ✅ FIX: Use upsert() instead of update()
const updateSettings = async (updates: { logo_url: string }) => {
  const { data, error } = await supabase
    .from("settings")
    .upsert({ id: "global_settings", ...updates }, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;
  return data;
};

const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { role } = useAuth();

  const [logoUrl, setLogoUrl] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);

  // ✅ Fetch initial settings data using react-query
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: queryKeys.settings.all(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("id", "global_settings")
        .single();
      if (error && error.code !== "PGRST116") throw error; // Ignore "not found" errors
      return data;
    },
  });

  useEffect(() => {
    if (settings?.logo_url) {
      setLogoUrl(settings.logo_url);
    }
  }, [settings]);

  const { mutate: saveSettings, isLoading: isSaving } = useMutation({
    mutationFn: updateSettings,
    onSuccess: (updatedData) => {
      toast.success("Settings Saved");
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.profile() });
      setIsDirty(false);
      if (updatedData?.logo_url) {
        setLogoUrl(updatedData.logo_url);
      }
    },
    onError: (error: any) => {
      logger.error("Save error:", error);
      toast.error("Save Failed", error.message || "Could not save settings");
    },
  });

  const handleLogoUpload = (newUrls: string[]) => {
    const newUrl = newUrls[0] || "";
    setLogoUrl(newUrl);
    setIsDirty(true);
  };

  const handleSave = () => {
    if (!isDirty) {
      toast.info("No Changes", "No changes to save.");
      return;
    }
    console.log("Saving logo URL:", logoUrl);
    saveSettings({ logo_url: logoUrl });
  };

  const handleRemoveLogo = () => {
    setLogoUrl("");
    setIsDirty(true);
    toast.info("Logo Removed", "Save changes to apply.");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8 animate-fadeIn">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white">Settings</h2>
        <p className="text-slate-400 mt-2">Manage application preferences.</p>
      </div>

      {isLoadingSettings ? (
        <Spinner />
      ) : (
        role === "ADMIN" && (
          <SpotlightCard className="p-8">
            <h2 className="text-xl font-bold text-white mb-1">Branding</h2>
            <p className="text-slate-400 text-sm mb-6">
              Manage your workspace visual identity.
            </p>

            <div className="space-y-6">
              {/* Logo Upload Section */}
              <FileUploadSection
                title="Company Logo"
                bucketName="logos"
                folderPath="public"
                urls={logoUrl ? [logoUrl] : []}
                onUrlsChange={handleLogoUpload}
              />

              {/* Current Logo Preview */}
              {logoUrl && (
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:border-white/20 transition-all duration-300">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 bg-black/50 rounded-lg flex items-center justify-center p-2 border border-white/10">
                      <img
                        src={logoUrl}
                        alt="Logo Preview"
                        className="max-h-full max-w-full object-contain"
                        onError={() => setLogoUrl("")}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        Current Logo
                      </p>
                      <p className="text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                        <CheckCircle className="w-3 h-3" /> Active on Sidebar
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleRemoveLogo}
                    className="p-2 hover:bg-red-500/10 rounded-lg transition-all duration-300 group"
                    title="Remove logo"
                  >
                    <X className="w-5 h-5 text-slate-400 group-hover:text-red-400 transition-colors" />
                  </button>
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-white/10 flex justify-end">
              <Button
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                className="w-full sm:w-auto"
              >
                {isSaving ? <Spinner size="sm" /> : "Save Changes"}
              </Button>
            </div>
          </SpotlightCard>
        )
      )}

      <ChangePasswordForm />
    </div>
  );
};

export default SettingsPage;
