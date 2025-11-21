import React, { useState } from 'react';
import { Order, UserRole } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabaseClient';
import { updateOrder } from '../../services/orderService';
import { Upload, Download, Trash2, FileText, Loader2 } from 'lucide-react';

interface ProductionFilesProps {
    order: Order;
    onUpdate: (updatedOrder: Order) => void;
}

const getRevisionFromFilename = (filename: string): string => {
    const match = filename.match(/rev(\d+)/i);
    if (match && match[1]) {
        return `Rev ${match[1]}`;
    }
    return 'Rev 1';
};

const ProductionFiles: React.FC<ProductionFilesProps> = ({ order, onUpdate }) => {
    const { role } = useAuth();
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const canManageFiles = role === UserRole.ADMIN || role === UserRole.PRODUCTION;

    if (!canManageFiles) {
        return null;
    }

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        setIsUploading(true);
        setUploadError(null);

        const uploadedUrls: string[] = [];
        try {
            for (const file of files) {
                const filePath = `public/order_${order.id}/production/${Date.now()}_${file.name}`;
                const { data, error } = await supabase.storage
                    .from('order-attachments')
                    .upload(filePath, file);

                if (error) throw error;

                const { data: { publicUrl } } = supabase.storage
                    .from('order-attachments')
                    .getPublicUrl(filePath);
                
                uploadedUrls.push(publicUrl);
            }

            const updatedOrder = {
                ...order,
                productionFileUrls: [...(order.productionFileUrls || []), ...uploadedUrls],
            };
            const savedOrder = await updateOrder(updatedOrder);
            onUpdate(savedOrder);

        } catch (error: any) {
            setUploadError(`Upload failed: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeleteFile = async (urlToDelete: string) => {
        if (!window.confirm('Are you sure you want to delete this file?')) return;

        try {
            const filePath = new URL(urlToDelete).pathname.split('/order-attachments/')[1];
            const { error } = await supabase.storage.from('order-attachments').remove([filePath]);
            if (error) throw error;

            const updatedUrls = (order.productionFileUrls || []).filter((url: string) => url !== urlToDelete);
            const updatedOrder = { ...order, productionFileUrls: updatedUrls };
            const savedOrder = await updateOrder(updatedOrder);
            onUpdate(savedOrder);
        } catch (error: any) {
            console.error('Failed to delete file:', error);
            alert(`Failed to delete file: ${error.message}`);
        }
    };

    return (
        <div className="bg-[#1A1B23] border border-[#252836] rounded-2xl p-6 space-y-4">
            <h3 className="text-xl font-semibold tracking-wide text-slate-100 mb-2">Production Files</h3>
            
            <div className="space-y-3">
                {(order.productionFileUrls || []).length === 0 ? (
                    <p className="text-slate-400 text-sm">No production files uploaded yet.</p>
                ) : (
                    (order.productionFileUrls || []).map((url: string, index: number) => {
                        const filename = url.split('/').pop()?.split('?')[0] || 'file';
                        const decodedFilename = decodeURIComponent(filename.substring(filename.indexOf('_') + 1));
                        const revision = getRevisionFromFilename(decodedFilename);

                        return (
                            <div key={index} className="flex items-center justify-between bg-slate-800/50 p-3 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <FileText className="w-5 h-5 text-slate-400" />
                                    <div>
                                        <p className="text-sm font-medium text-white">{decodedFilename}</p>
                                        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{revision}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <a href={url} download target="_blank" rel="noopener noreferrer" className="p-2 rounded-md hover:bg-slate-700 text-slate-300 transition-colors">
                                        <Download className="w-4 h-4" />
                                    </a>
                                    <button onClick={() => handleDeleteFile(url)} className="p-2 rounded-md hover:bg-red-500/20 text-red-400 transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="mt-4">
                <label htmlFor="production-file-upload" className="flex items-center justify-center gap-2 w-full px-4 py-2 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:bg-slate-800/60 hover:border-slate-500 transition-colors">
                    {isUploading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Uploading...</span>
                        </>
                    ) : (
                        <>
                            <Upload className="w-4 h-4" />
                            <span>Upload Production Files</span>
                        </>
                    )}
                </label>
                <input id="production-file-upload" type="file" multiple onChange={handleFileUpload} className="hidden" disabled={isUploading} />
                {uploadError && <p className="text-red-400 text-sm mt-2">{uploadError}</p>}
            </div>
        </div>
    );
};

export default ProductionFiles;