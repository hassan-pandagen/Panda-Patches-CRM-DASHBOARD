import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabaseClient";
import { logger } from "../services/logger";
import { useAuth } from "../contexts/AuthContext";
import { UserRole } from "../types/index";
import { useToast } from "../hooks/useToast";
import { queryKeys } from "../constants/queryKeys";
import FileUploadSection from "../components/orders/FileUpload";
import Button from "../components/ui/Button";
import GlassCard from "../components/ui/GlassCard";
import SpotlightCard from "../components/ui/SpotlightCard";
import { ChangePasswordForm } from "../components/settings/ChangePasswordForm";
import Spinner from "../components/ui/Spinner";
import { CheckCircle, X, Trash2, Search, HardDrive, AlertTriangle } from "lucide-react";
import { scanOrphanedFiles, deleteOrphanedFiles, type CleanupReport, type OrphanedFile } from "../services/storageCleanup";

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
              <div>
                <label className="text-sm font-medium text-slate-300 mb-4 block">
                  Company Logo
                </label>
                <FileUploadSection
                  title=""
                  bucketName="logos"
                  folderPath="public"
                  urls={logoUrl ? [logoUrl] : []}
                  onUrlsChange={handleLogoUpload}
                />
              </div>

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

      {/* Storage Cleanup — Admin Only */}
      {role === UserRole.ADMIN && <StorageCleanupSection />}
    </div>
  );
};

function StorageCleanupSection() {
  const toast = useToast();
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleScan = async () => {
    setScanning(true);
    setReport(null);
    setSelected(new Set());
    try {
      const result = await scanOrphanedFiles();
      setReport(result);
      // Select all orphaned files by default
      setSelected(new Set(result.orphanedFiles.map(f => `${f.bucket}/${f.path}`)));
      if (result.orphanedFiles.length === 0) {
        toast.success('Storage is clean — no orphaned files found!');
      }
    } catch (err) {
      toast.error('Failed to scan storage');
      logger.error('Storage scan failed', err);
    } finally {
      setScanning(false);
    }
  };

  const handleDelete = async () => {
    if (!report) return;
    const filesToDelete = report.orphanedFiles.filter(f => selected.has(`${f.bucket}/${f.path}`));
    if (filesToDelete.length === 0) return;

    setDeleting(true);
    try {
      const result = await deleteOrphanedFiles(filesToDelete);
      toast.success(`Deleted ${result.deleted} files, freed ${result.freedMB.toFixed(1)} MB`);
      // Re-scan
      await handleScan();
    } catch (err) {
      toast.error('Failed to delete files');
    } finally {
      setDeleting(false);
    }
  };

  const toggleFile = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (!report) return;
    if (selected.size === report.orphanedFiles.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(report.orphanedFiles.map(f => `${f.bucket}/${f.path}`)));
    }
  };

  return (
    <SpotlightCard>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-brand-orange" />
            Storage Cleanup
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Find and delete orphaned files not linked to any order or quote
          </p>
        </div>
        <Button onClick={handleScan} disabled={scanning}>
          {scanning ? <Spinner size="sm" /> : <><Search className="w-4 h-4" /> Scan Storage</>}
        </Button>
      </div>

      {report && (
        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <p className="text-xs text-slate-400 uppercase font-semibold">Files Scanned</p>
              <p className="text-xl font-bold text-white">{report.totalFilesScanned}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <p className="text-xs text-slate-400 uppercase font-semibold">In Use</p>
              <p className="text-xl font-bold text-emerald-400">{report.referencedFiles}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <p className="text-xs text-slate-400 uppercase font-semibold">Orphaned</p>
              <p className="text-xl font-bold text-amber-400">{report.orphanedFiles.length}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <p className="text-xs text-slate-400 uppercase font-semibold">Can Free Up</p>
              <p className="text-xl font-bold text-red-400">{report.orphanedSizeMB.toFixed(1)} MB</p>
            </div>
          </div>

          {/* Per-bucket breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Object.entries(report.bucketBreakdown).map(([bucket, stats]) => (
              <div key={bucket} className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <p className="text-xs text-slate-500 font-mono">{bucket}</p>
                <p className="text-sm text-slate-300 mt-1">
                  {stats.total} files · <span className="text-amber-400">{stats.orphaned} orphaned</span>
                  {stats.orphanedSizeMB > 0 && <span className="text-red-400"> ({stats.orphanedSizeMB.toFixed(1)} MB)</span>}
                </p>
              </div>
            ))}
          </div>

          {/* Orphaned files list */}
          {report.orphanedFiles.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <button onClick={toggleAll} className="text-xs text-brand-orange hover:underline">
                  {selected.size === report.orphanedFiles.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-xs text-slate-500">{selected.size} selected</span>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1 bg-slate-900/50 rounded-lg p-2 border border-slate-700/30">
                {report.orphanedFiles.map((file) => {
                  const key = `${file.bucket}/${file.path}`;
                  return (
                    <label key={key} className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleFile(key)}
                        className="rounded border-slate-600 text-brand-orange focus:ring-brand-orange"
                      />
                      <span className="text-xs font-mono text-slate-400 truncate flex-1">{file.bucket}/{file.path}</span>
                      {file.size ? <span className="text-xs text-slate-500 shrink-0">{(file.size / 1024).toFixed(0)} KB</span> : null}
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                <div className="flex items-center gap-2 text-amber-400 text-xs">
                  <AlertTriangle className="w-4 h-4" />
                  This action cannot be undone
                </div>
                <button
                  onClick={handleDelete}
                  disabled={deleting || selected.size === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 rounded-lg text-white text-sm font-semibold transition-colors"
                >
                  {deleting ? <Spinner size="sm" /> : <><Trash2 className="w-4 h-4" /> Delete {selected.size} Files</>}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </SpotlightCard>
  );
}

export default SettingsPage;
