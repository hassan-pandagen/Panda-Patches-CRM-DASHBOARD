import { supabase } from './supabaseClient';
import { v4 as uuidv4 } from 'uuid';

// --- ACTION REQUIRED in Supabase Studio ---
// 1. Go to Storage > Buckets
// 2. Create a new PUBLIC bucket named 'order-attachments'
// 3. Go to the new bucket's policies and add the policies from the Settings page in the app.
export const ORDER_ATTACHMENTS_BUCKET = 'order-attachments';

/**
 * Uploads a file to the Supabase Storage bucket.
 * @param file The file to upload.
 * @returns The public URL of the uploaded file.
 */
export const uploadFile = async (file: File): Promise<string> => {
    const fileExtension = file.name.split('.').pop();
    // Use a UUID to ensure file names are always unique and avoid conflicts.
    const fileName = `${uuidv4()}.${fileExtension}`;
    const filePath = `${fileName}`; // Keep it simple at the root of the bucket.

    const { error: uploadError } = await supabase.storage
        .from(ORDER_ATTACHMENTS_BUCKET)
        .upload(filePath, file);

    if (uploadError) {
        console.error('Error uploading file:', uploadError);
        throw new Error('Failed to upload file to storage.');
    }

    const { data } = supabase.storage
        .from(ORDER_ATTACHMENTS_BUCKET)
        .getPublicUrl(filePath);

    if (!data.publicUrl) {
        throw new Error('Could not get public URL for the uploaded file.');
    }

    return data.publicUrl;
};

/**
 * Deletes a file from Supabase Storage based on its public URL.
 * @param publicUrl The public URL of the file to delete.
 */
export const deleteFile = async (publicUrl: string): Promise<void> => {
    // Gracefully handle base64 data strings by ignoring them, as they aren't in storage.
    if (!publicUrl || publicUrl.startsWith('data:')) {
        return;
    }

    try {
        // Extract the file path from the full URL.
        const urlParts = publicUrl.split('/');
        const bucketIndex = urlParts.findIndex(part => part === ORDER_ATTACHMENTS_BUCKET);
        
        if (bucketIndex === -1 || bucketIndex + 1 >= urlParts.length) {
            // This handles malformed URLs that aren't base64 strings.
            console.warn(`Could not parse file path from URL, skipping deletion: ${publicUrl}`);
            return;
        }
        
        const filePath = urlParts.slice(bucketIndex + 1).join('/');

        const { error: deleteError } = await supabase.storage
            .from(ORDER_ATTACHMENTS_BUCKET)
            .remove([filePath]);

        if (deleteError) {
            // It's common for a file to not be found if it was already deleted,
            // so we can often ignore "Not found" errors to prevent UI failures.
            if (deleteError.message.includes('Not found')) {
                 console.warn(`File not found in storage, may have already been deleted: ${filePath}`);
            } else {
                console.error('Error deleting file:', deleteError);
                throw new Error('Failed to delete file from storage.');
            }
        }
    } catch (error) {
        console.error("Error in deleteFile utility:", error);
        // We throw the error so the calling function (using Promise.allSettled) can handle it.
        throw error;
    }
};
