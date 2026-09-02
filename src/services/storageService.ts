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
  try {
    // Validate input
    if (!file) throw new Error('File is required');
    if (!(file instanceof File)) throw new Error('Invalid file object');
    if (file.size === 0) throw new Error('File is empty');
    if (file.size > 50 * 1024 * 1024) throw new Error('File exceeds 50MB limit');

    const fileExtension = file.name.split('.').pop() || 'bin';
    if (!fileExtension) throw new Error('File must have an extension');

    // Preserve original filename with timestamp prefix for uniqueness
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${Date.now()}_${sanitizedName}`;
    const filePath = `${fileName}`;

    logger.info(`[Storage Service] Uploading file: ${file.name} (${file.size} bytes)`);

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

    if (!urlData?.publicUrl) throw new Error('Failed to get public URL from storage');

    logger.info(`[Storage Service] File uploaded successfully: ${filePath}`);
    return urlData.publicUrl;
  } catch (err: any) {
    logger.error('[Storage Service] uploadFile failed', err);
    throw err;
  }
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
// ── Private-bucket signing (Task 0.2, digitizer-portal brief) ────────────────
//
// `production-files` holds the digitizing/machine files — the stitch files that
// let anyone reproduce a patch. Imran's decision (2 Sept) is that these are the
// asset worth protecting; mockups and customer references stay public.
//
// The wrinkle: FileUpload stores `getPublicUrl(path)` output in the DB, so every
// existing row holds a `/object/public/...` string. Those stop resolving the
// moment the bucket goes private. Rather than rewrite ~528 stored URLs, the
// stored value is treated as a *path carrier* and re-signed at render time.
//
// Ordering matters: ship this, then flip the bucket. Reversed, the order page
// and the production-complete email break instantly — the same mistake the
// payment-token migration was split in two to avoid.
const PRIVATE_BUCKETS = ['production-files'] as const;

/** Pull `{ bucket, path }` out of a Supabase storage URL, public or signed. */
export const parseStorageUrl = (url: string): { bucket: string; path: string } | null => {
  try {
    for (const marker of ['/storage/v1/object/public/', '/storage/v1/object/sign/']) {
      const i = url.indexOf(marker);
      if (i === -1) continue;
      const rest = url.substring(i + marker.length).split('?')[0];
      const slash = rest.indexOf('/');
      if (slash === -1) return null;
      return { bucket: rest.slice(0, slash), path: decodeURIComponent(rest.slice(slash + 1)) };
    }
    return null;
  } catch {
    return null;
  }
};

export const isPrivateBucketUrl = (url: string): boolean => {
  const parsed = parseStorageUrl(url);
  return !!parsed && (PRIVATE_BUCKETS as readonly string[]).includes(parsed.bucket);
};

/**
 * Returns a short-lived signed URL for a private-bucket file; returns the input
 * untouched for anything else, so callers can pass mixed lists through blindly.
 *
 * `expiresIn` defaults to 15 minutes per the brief. The production-complete
 * email passes a longer window — an inline <img> in an inbox has to keep
 * resolving after the reader gets round to opening it, which 15 minutes will not.
 */
export const toSignedUrl = async (url: string, expiresIn = 900): Promise<string> => {
  const parsed = parseStorageUrl(url);
  if (!parsed || !(PRIVATE_BUCKETS as readonly string[]).includes(parsed.bucket)) return url;
  try {
    const { data, error } = await supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, expiresIn);
    if (error || !data?.signedUrl) {
      logger.error('[Storage] createSignedUrl failed', { path: parsed.path, error });
      return url; // degrade to the unsigned URL rather than rendering nothing
    }
    return data.signedUrl;
  } catch (err) {
    logger.error('[Storage] createSignedUrl threw', err);
    return url;
  }
};

/** Batch form — preserves order and never rejects. */
export const toSignedUrls = async (urls: string[], expiresIn = 900): Promise<string[]> =>
  Promise.all((urls || []).map(u => toSignedUrl(u, expiresIn)));
