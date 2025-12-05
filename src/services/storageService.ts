import { supabase } from './supabaseClient';
import { logger } from './logger'; // ✅ UPGRADE 6: Logger service

// --- ACTION REQUIRED in Supabase Studio ---
// 1. Go to Storage > Buckets
// 2. Create a new bucket called "order-attachments" (or your preferred name)
// 3. Set it to Public if you want files to be accessible without auth
// 4. Update the BUCKET_NAME constant below to match your bucket name

const BUCKET_NAME = 'order-attachments';

/**
 * Uploads a file to Supabase Storage and returns the public URL.
 * Uses crypto.randomUUID() for generating unique filenames (built-in, no dependencies).
 */
export const uploadFile = async (file: File): Promise<string> => {
  const fileExtension = file.name.split('.').pop();
  // Use crypto.randomUUID() - a Web Crypto API standard, built into modern browsers & Node.js
  const fileName = `${crypto.randomUUID()}.${fileExtension}`;
  const filePath = `${fileName}`; // Keep it simple at the root of the bucket.

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  return urlData.publicUrl;
};

/**
 * Deletes a file from Supabase Storage given its public URL.
 */
export const deleteFile = async (fileUrl: string): Promise<void> => {
  try {
    const url = new URL(fileUrl);
    const pathParts = url.pathname.split(`/storage/v1/object/public/${BUCKET_NAME}/`);
    if (pathParts.length < 2) {
      logger.warn('[Storage Service] Invalid file URL format', fileUrl);
      return;
    }
    const filePath = pathParts[1];

    const { error: deleteError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (deleteError) throw deleteError; // ← FIXED: Use deleteError, not error

  } catch (error) {
    logger.error('[Storage Service] Error deleting file', error);
    throw error;
  }
};