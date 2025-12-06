import React, { useCallback, useState } from 'react';
import { Upload, X, FileText, Image as ImageIcon, ArrowDownCircle, Eye } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { logger } from '../../services/logger';
import { OptimizedImage } from '../ui/OptimizedImage';

interface FileUploadSectionProps {
  title: string;
  bucketName: string;
  folderPath: string;
  urls: string[];
  onUrlsChange: (urls: string[]) => void;
  
  // ✅ NEW PROP: Function to handle moving file to another list
  onMoveFile?: (url: string) => void;
  moveLabel?: string;
}

const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  title,
  bucketName,
  folderPath,
  urls = [],
  onUrlsChange,
  onMoveFile,
  moveLabel
}) => {
  const [isDragActive, setIsDragActive] = useState(false);
  // ✅ DAY 4 FIX: Track upload errors
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  // ✅ UPGRADE: Image preview modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleUploadFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;

    const newUrls: string[] = [];
    const errors: string[] = [];
    
    for (const file of Array.from(files)) {
      try {
        // ✅ DAY 4 FIX: Validate file before upload
        if (!file.name) {
          errors.push('File name is missing');
          continue;
        }
        
        const fileExt = file.name.split('.').pop();
        if (!fileExt) {
          errors.push(`${file.name} has no file extension`);
          continue;
        }
        
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `${folderPath}/${fileName}`;
        
        const { error, data: uploadData } = await supabase.storage.from(bucketName).upload(filePath, file);
        
        if (error) {
          logger.error(`[FileUpload] Upload failed for ${file.name}`, error);
          errors.push(`Failed to upload ${file.name}: ${error.message}`);
          continue;
        }
        
        const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
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
    
    // ✅ DAY 4 FIX: Report errors
    if (errors.length > 0) {
      setUploadErrors(errors);
      logger.warn(`[FileUpload] ${errors.length} file(s) failed to upload`);
    }
    
    onUrlsChange([...urls, ...newUrls]);
  }, [bucketName, folderPath, urls, onUrlsChange]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = () => {
    setIsDragActive(false);
  };

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

  // helper to get filename
  const getFileName = (url: string) => url.split('/').pop()?.split('?')[0] || 'File';

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-slate-300">{title}</h4>
      
      {/* ✅ DAY 4 FIX: Display upload errors */}
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
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-brand-orange bg-brand-orange/10' : 'border-white/10 hover:border-brand-orange/50 hover:bg-white/5'}`}
      >
        <input 
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
          id={`file-input-${title}`}
        />
        <label htmlFor={`file-input-${title}`} className="cursor-pointer block">
          <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-400">
            {isDragActive ? "Drop files here..." : "Drag & drop or click to upload"}
          </p>
        </label>
      </div>

      {/* File List */}
      <div className="space-y-2">
        {urls.map((url, index) => (
          <div key={url + index} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5 group hover:border-white/10">
            <div className="flex items-center gap-3 overflow-hidden">
              {url.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) ? (
                <img src={url} alt="Thumbnail" className="w-10 h-10 object-cover rounded" />
              ) : (
                <div className="w-10 h-10 bg-slate-700 rounded flex items-center justify-center">
                  <FileText className="w-5 h-5 text-slate-400" />
                </div>
              )}
              <a href={url} target="_blank" rel="noreferrer" className="text-sm text-blue-400 hover:underline truncate max-w-[200px]">
                {getFileName(url)}
              </a>
            </div>
            
            <div className="flex items-center gap-2">
              
              {/* ✅ Preview Button */}
              {url.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) && (
                <button
                  type="button"
                  onClick={() => setPreviewUrl(url)}
                  className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
                  title="Preview Image"
                >
                  <Eye className="w-4 h-4" />
                </button>
              )}
              
              {/* ✅ THE MOVE BUTTON */}
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

              {/* Delete Button */}
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

      {/* ✅ Preview Modal */}
      {previewUrl && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div 
            className="bg-slate-900 rounded-lg border border-white/10 max-w-4xl max-h-[85vh] overflow-auto"
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
              <OptimizedImage 
                src={previewUrl}
                alt={getFileName(previewUrl)}
                className="max-w-full max-h-[70vh] rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploadSection;