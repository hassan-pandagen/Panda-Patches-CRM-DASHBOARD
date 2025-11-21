import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '../../services/supabaseClient';
import { Loader2, File as FileIcon, X, UploadCloud, CheckCircle } from 'lucide-react';

interface FileUploadProps {
  orderNumber: string;
  initialFiles: string[];
  onUploadComplete: (newFileUrl: string) => void;
  onFileRemove: (fileUrl: string) => void;
  // NEW PROPS FOR REUSABILITY
  bucketName?: string; // Default to 'orders'
  folderPath?: string; // e.g., 'mockups', 'shipping', 'production-files'
  label?: string;      // Custom text for the dropzone
}

const FileUpload: React.FC<FileUploadProps> = ({ 
  orderNumber, 
  initialFiles, 
  onUploadComplete, 
  onFileRemove,
  bucketName = 'orders',
  folderPath = 'files',
  label = "Drag & drop files here, or click to select"
}) => {
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsUploading(true);
    try {
      for (const file of acceptedFiles) {
        // Sanitize filename to avoid special char issues
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${folderPath}/${orderNumber}/${Date.now()}-${sanitizedName}`;
        
        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from(bucketName)
          .getPublicUrl(filePath);

        onUploadComplete(publicUrl);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [orderNumber, onUploadComplete, bucketName, folderPath]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // Accept almost anything since this is used for various file types now
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
      'application/x-dst': ['.dst'],
      'application/x-embroidery': ['.emb'],
      'application/illustrator': ['.ai'],
      'image/svg+xml': ['.svg']
    },
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all duration-200 group
          ${isDragActive 
            ? 'border-brand-orange bg-brand-orange/10' 
            : 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/50'}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center gap-2 text-slate-400 group-hover:text-slate-300">
          <UploadCloud size={24} className={isDragActive ? 'text-brand-orange' : 'text-slate-500'} />
          <div>
            {isUploading ? (
              <p className="text-sm font-medium animate-pulse">Uploading to cloud...</p>
            ) : (
              <p className="text-sm">{label}</p>
            )}
          </div>
        </div>
      </div>

      {/* File List */}
      <div className="space-y-2">
        {initialFiles.map((fileUrl, index) => (
          <div key={index} className="flex items-center justify-between bg-slate-700/30 border border-white/5 p-2 rounded-md text-sm group">
            <div className="flex items-center gap-2 overflow-hidden">
              <FileIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-slate-300 truncate hover:text-brand-orange hover:underline decoration-brand-orange/50 underline-offset-2 transition-colors">
                {/* Clean up filename for display */}
                {decodeURIComponent(fileUrl.split('/').pop()?.split('-').slice(1).join('-') || 'file')}
              </a>
            </div>
            <button
              type="button"
              onClick={() => onFileRemove(fileUrl)}
              className="p-1 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileUpload;