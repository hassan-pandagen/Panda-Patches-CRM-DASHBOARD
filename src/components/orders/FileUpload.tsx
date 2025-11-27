import React, { useCallback } from 'react';
import { Upload, X, FileText, Image as ImageIcon, ArrowDownCircle } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '../../services/supabaseClient';

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
  
  // ... (Keep your existing onDrop logic here) ...
  // If you don't have the full code handy, I will provide the logic below
  // But assuming you have the upload logic, we just need to update the UI rendering part.

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // ... (Your existing upload logic) ...
    // I am omitting the upload implementation for brevity, 
    // assume it uploads and calls onUrlsChange([...urls, newUrl])
    
    // TEMPORARY RE-IMPLEMENTATION FOR COMPLETENESS:
    const newUrls: string[] = [];
    for (const file of acceptedFiles) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `${folderPath}/${fileName}`;
      const { error } = await supabase.storage.from(bucketName).upload(filePath, file);
      if (!error) {
        const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
        newUrls.push(data.publicUrl);
      }
    }
    onUrlsChange([...urls, ...newUrls]);
  }, [bucketName, folderPath, urls, onUrlsChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const removeFile = (indexToRemove: number) => {
    onUrlsChange(urls.filter((_, index) => index !== indexToRemove));
  };

  // helper to get filename
  const getFileName = (url: string) => url.split('/').pop()?.split('?')[0] || 'File';

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-slate-300">{title}</h4>
      
      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-brand-orange bg-brand-orange/10' : 'border-white/10 hover:border-brand-orange/50 hover:bg-white/5'}`}
      >
        <input {...getInputProps()} />
        <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <p className="text-sm text-slate-400">
          {isDragActive ? "Drop files here..." : "Drag & drop or click to upload"}
        </p>
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
    </div>
  );
};

export default FileUploadSection;