// src/services/storageCleanup.ts - Storage Cleanup & Orphan Detection
import { supabase } from './supabaseClient';
import { logger } from './logger';

const BUCKETS = ['order-attachments', 'production-files', 'quote-mockups'] as const;

// URL columns that store file references in orders table
const ORDER_FILE_COLUMNS = [
  'production_file_urls',
  'shipping_attachment_urls',
  'customer_attachment_urls',
  'mockup_urls',
  'redo_attachments',
] as const;

// URL columns in quotes table
const QUOTE_FILE_COLUMNS = [
  'mockup_urls',
  'customer_attachment_urls',
] as const;

export interface OrphanedFile {
  bucket: string;
  path: string;
  size?: number;
  createdAt?: string;
}

export interface CleanupReport {
  totalFilesScanned: number;
  referencedFiles: number;
  orphanedFiles: OrphanedFile[];
  orphanedSizeMB: number;
  bucketBreakdown: Record<string, { total: number; orphaned: number; orphanedSizeMB: number }>;
}

/**
 * Extract file path from a Supabase storage public URL
 */
function extractFilePath(url: string, bucket: string): string | null {
  try {
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(url.substring(idx + marker.length));
  } catch {
    return null;
  }
}

/**
 * Get all file URLs currently referenced in the database
 */
async function getAllReferencedUrls(): Promise<Set<string>> {
  const urls = new Set<string>();

  // Get all file URLs from orders
  const { data: orders } = await supabase
    .from('orders')
    .select(ORDER_FILE_COLUMNS.join(','));

  if (orders) {
    for (const order of orders) {
      for (const col of ORDER_FILE_COLUMNS) {
        const val = (order as any)[col];
        if (Array.isArray(val)) {
          val.forEach((u: string) => { if (u) urls.add(u); });
        }
      }
    }
  }

  // Get all file URLs from quotes
  const { data: quotes } = await supabase
    .from('quotes')
    .select(QUOTE_FILE_COLUMNS.join(','));

  if (quotes) {
    for (const quote of quotes) {
      for (const col of QUOTE_FILE_COLUMNS) {
        const val = (quote as any)[col];
        if (Array.isArray(val)) {
          val.forEach((u: string) => { if (u) urls.add(u); });
        }
      }
    }
  }

  return urls;
}

/**
 * List all files in a storage bucket
 */
async function listBucketFiles(bucket: string): Promise<{ path: string; size: number; createdAt: string }[]> {
  const files: { path: string; size: number; createdAt: string }[] = [];

  // List root-level files and folders
  const { data, error } = await supabase.storage.from(bucket).list('', { limit: 1000 });
  if (error) {
    logger.error(`Failed to list bucket ${bucket}`, error);
    return files;
  }

  for (const item of data || []) {
    if (item.id) {
      // It's a file
      files.push({
        path: item.name,
        size: (item.metadata as any)?.size || 0,
        createdAt: item.created_at || '',
      });
    } else {
      // It's a folder — list contents
      const { data: folderData } = await supabase.storage.from(bucket).list(item.name, { limit: 1000 });
      for (const subItem of folderData || []) {
        if (subItem.id) {
          files.push({
            path: `${item.name}/${subItem.name}`,
            size: (subItem.metadata as any)?.size || 0,
            createdAt: subItem.created_at || '',
          });
        }
      }
    }
  }

  return files;
}

/**
 * Scan all storage buckets and identify orphaned files
 */
export async function scanOrphanedFiles(): Promise<CleanupReport> {
  logger.info('[Storage Cleanup] Starting orphan scan...');

  const referencedUrls = await getAllReferencedUrls();
  const report: CleanupReport = {
    totalFilesScanned: 0,
    referencedFiles: 0,
    orphanedFiles: [],
    orphanedSizeMB: 0,
    bucketBreakdown: {},
  };

  for (const bucket of BUCKETS) {
    const files = await listBucketFiles(bucket);
    const bucketStats = { total: files.length, orphaned: 0, orphanedSizeMB: 0 };
    report.totalFilesScanned += files.length;

    for (const file of files) {
      // Build the public URL for this file to check against references
      const { data } = supabase.storage.from(bucket).getPublicUrl(file.path);
      const publicUrl = data?.publicUrl || '';

      // Check if any referenced URL matches this file
      const isReferenced = Array.from(referencedUrls).some(url =>
        url === publicUrl || url.includes(file.path)
      );

      if (isReferenced) {
        report.referencedFiles++;
      } else {
        const sizeMB = file.size / (1024 * 1024);
        report.orphanedFiles.push({ bucket, path: file.path, size: file.size, createdAt: file.createdAt });
        report.orphanedSizeMB += sizeMB;
        bucketStats.orphaned++;
        bucketStats.orphanedSizeMB += sizeMB;
      }
    }

    report.bucketBreakdown[bucket] = bucketStats;
  }

  logger.info(`[Storage Cleanup] Scan complete: ${report.orphanedFiles.length} orphaned files (${report.orphanedSizeMB.toFixed(1)} MB)`);
  return report;
}

/**
 * Delete specific orphaned files from storage
 */
export async function deleteOrphanedFiles(files: OrphanedFile[]): Promise<{ deleted: number; failed: number; freedMB: number }> {
  let deleted = 0;
  let failed = 0;
  let freedBytes = 0;

  // Group files by bucket for batch deletion
  const byBucket = new Map<string, string[]>();
  for (const file of files) {
    if (!byBucket.has(file.bucket)) byBucket.set(file.bucket, []);
    byBucket.get(file.bucket)!.push(file.path);
  }

  for (const [bucket, paths] of byBucket) {
    // Supabase allows batch delete
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) {
      logger.error(`[Storage Cleanup] Failed to delete ${paths.length} files from ${bucket}`, error);
      failed += paths.length;
    } else {
      deleted += paths.length;
      freedBytes += files.filter(f => f.bucket === bucket).reduce((s, f) => s + (f.size || 0), 0);
    }
  }

  const freedMB = freedBytes / (1024 * 1024);
  logger.info(`[Storage Cleanup] Deleted ${deleted} files, freed ${freedMB.toFixed(1)} MB. Failed: ${failed}`);
  return { deleted, failed, freedMB };
}

/**
 * Delete all storage files associated with a list of URLs
 * Call this before deleting an order/quote record
 */
export async function deleteFilesByUrls(urls: string[]): Promise<void> {
  if (!urls.length) return;

  const byBucket = new Map<string, string[]>();

  for (const url of urls) {
    if (!url) continue;
    for (const bucket of BUCKETS) {
      const path = extractFilePath(url, bucket);
      if (path) {
        if (!byBucket.has(bucket)) byBucket.set(bucket, []);
        byBucket.get(bucket)!.push(path);
        break;
      }
    }
  }

  for (const [bucket, paths] of byBucket) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) {
      logger.error(`[Storage Cleanup] Failed to delete files from ${bucket}`, error);
    }
  }
}
