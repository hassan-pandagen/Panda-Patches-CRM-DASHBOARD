import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Upload,
  X,
  FileText,
  ArrowDownCircle,
  Eye,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { logger } from "../../services/logger";

interface FileUploadSectionProps {
  title: string;
  bucketName: string;
  folderPath: string;
  urls: string[];
  onUrlsChange: (urls: string[]) => void;
  allowMultiple?: boolean;
  onMoveFile?: (url: string) => void;
  moveLabel?: string;
  onUploadStateChange?: (isUploading: boolean) => void;
}

const isImage = (url: string) =>
  /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);

const isExcel = (url: string) =>
  /\.(xlsx|xls|csv)(\?|$)/i.test(url);

const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  title,
  bucketName,
  folderPath,
  urls = [],
  onUrlsChange,
  onMoveFile,
  moveLabel,
  onUploadStateChange,
}) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleUploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;

      onUploadStateChange?.(true);

      const newUrls: string[] = [];
      const errors: string[] = [];

      try {
        for (const file of Array.from(files)) {
          try {
            if (!file.name) {
              errors.push("File name is missing");
              continue;
            }

            const fileExt = file.name.split(".").pop();
            if (!fileExt) {
              errors.push(`${file.name} has no file extension`);
              continue;
            }

            const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const fileName = `${Date.now()}_${sanitizedName}`;
            const filePath = `${folderPath}/${fileName}`;

            const { error } = await supabase.storage
              .from(bucketName)
              .upload(filePath, file);

            if (error) {
              logger.error(`[FileUpload] Upload failed for ${file.name}`, error);
              errors.push(`Failed to upload ${file.name}: ${error.message}`);
              continue;
            }

            const { data } = supabase.storage
              .from(bucketName)
              .getPublicUrl(filePath);

            if (!data?.publicUrl) {
              errors.push(`Failed to get public URL for ${file.name}`);
              continue;
            }

            newUrls.push(data.publicUrl);
          } catch (err: any) {
            logger.error(`[FileUpload] Unexpected error uploading ${file.name}`, err);
            errors.push(`Unexpected error: ${err.message}`);
          }
        }

        if (errors.length > 0) {
          setUploadErrors(errors);
          logger.warn(`[FileUpload] ${errors.length} file(s) failed to upload`);
        }

        onUrlsChange([...urls, ...newUrls]);
      } finally {
        onUploadStateChange?.(false);
      }
    },
    [bucketName, folderPath, urls, onUrlsChange, onUploadStateChange]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = () => setIsDragActive(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    handleUploadFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleUploadFiles(e.target.files);
  };

  const removeFile = (indexToRemove: number) => {
    onUrlsChange(urls.filter((_, index) => index !== indexToRemove));
  };

  const getFileName = (url: string) => {
    const raw = decodeURIComponent(url.split("/").pop()?.split("?")[0] || "File");
    return raw.replace(/^(mockup_)?\d{10,}_/, "").replace(/^[a-f0-9-]{36}\./, "") || raw;
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-slate-300">{title}</h4>

      {uploadErrors.length > 0 && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-xs font-semibold text-red-400 mb-1">Upload Errors:</p>
          {uploadErrors.map((error, idx) => (
            <p key={idx} className="text-xs text-red-300">{error}</p>
          ))}
        </div>
      )}

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-300
          ${isDragActive
            ? "border-brand-orange bg-brand-orange/10 scale-105"
            : "border-white/10 hover:border-brand-orange/50 hover:bg-brand-orange/5"
          }`}
      >
        <input
          type="file"
          multiple
          accept="image/*,.pdf,.xlsx,.xls,.csv,.ai,.eps,.psd,.svg,.dst,.emb,.zip"
          onChange={handleFileInput}
          className="hidden"
          id={`file-input-${title}`}
        />
        <label htmlFor={`file-input-${title}`} className="cursor-pointer block">
          <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-400">
            {isDragActive ? "Drop files here..." : "Drag & drop or click to upload"}
          </p>
          <p className="text-xs text-slate-500 mt-1">Images, PDF, Excel, AI, EPS, PSD, SVG, DST, EMB, ZIP</p>
        </label>
      </div>

      {/* File List */}
      <div className="space-y-2">
        {urls.map((url, index) => (
          <div
            key={url + index}
            className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5 group hover:border-white/10"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              {isImage(url) ? (
                <img src={url} alt="Thumbnail" className="w-10 h-10 object-cover rounded" />
              ) : (
                <div className="w-10 h-10 bg-slate-700 rounded flex items-center justify-center">
                  <FileText className="w-5 h-5 text-slate-400" />
                </div>
              )}
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-blue-400 hover:underline truncate max-w-[200px]"
              >
                {getFileName(url)}
              </a>
            </div>

            <div className="flex items-center gap-2">
              {isImage(url) && (
                <button
                  type="button"
                  onClick={() => setPreviewUrl(url)}
                  className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
                  title="Preview Image"
                >
                  <Eye className="w-4 h-4" />
                </button>
              )}

              {onMoveFile && (
                <button
                  type="button"
                  onClick={() => onMoveFile(url)}
                  className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded transition-colors"
                  title={moveLabel || "Move File"}
                >
                  <ArrowDownCircle className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => removeFile(index)}
                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Modal — rendered via portal to escape any parent transform/filter/overflow */}
      {previewUrl &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
            onClick={() => setPreviewUrl(null)}
          >
            <div
              className="bg-slate-900 rounded-lg border border-white/10 max-w-4xl max-h-[90vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">{getFileName(previewUrl)}</h3>
                <button
                  onClick={() => setPreviewUrl(null)}
                  className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 flex items-center justify-center">
                <img
                  src={previewUrl}
                  alt={getFileName(previewUrl)}
                  className="max-w-full max-h-[80vh] rounded"
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default FileUploadSection;
