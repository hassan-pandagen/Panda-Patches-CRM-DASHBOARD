// src/services/storageCleanup.ts - Storage Cleanup & Orphan Detection
import { supabase } from './supabaseClient';
import { logger } from './logger';
import { fetchAllPaged } from '../utils/fetchAllPaged';

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

  // Page through EVERY order. PostgREST silently caps a plain .select() at 1000 rows, and
  // there are 1,156 orders / 9,445 quotes — so the un-paged version saw only ~38% of live
  // file references and reported the other 62% as ORPHANED, offering live customer artwork
  // for permanent deletion. Same bug class as the Quotes-page truncation; fetchAllPaged
  // exists precisely for this.
  const orders = await fetchAllPaged<any>((from, to) =>
    supabase.from('orders').select(ORDER_FILE_COLUMNS.join(',')).order('id').range(from, to)
  );

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

  // Same for quotes — 9,445 rows, so the un-paged version saw barely 10% of them.
  const quotes = await fetchAllPaged<any>((from, to) =>
    supabase.from('quotes').select(QUOTE_FILE_COLUMNS.join(',')).order('id').range(from, to)
  );

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
 * Order identifiers that appear as PATH SEGMENTS in storage, e.g.
 * production-files/orders/1000/file.png  →  segment "1000".
 *
 * Not every file is referenced by a URL column. production-files is stored by path
 * convention (OrderForm uploads to a per-order folder; OrderPage renders the folder via
 * bucketName="production-files") and is NEVER written into orders.production_file_urls —
 * of 390 order folders in that bucket, 389 match live orders while only 15 orders have
 * production_file_urls at all, and those 15 point at a different bucket.
 *
 * A URL-only orphan check therefore classifies every one of those live files as orphaned.
 * This makes the check convention-aware so they are correctly treated as in use.
 */
async function getPathReferencedIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const rows = await fetchAllPaged<any>((from, to) =>
    supabase.from('orders').select('id,order_number').order('id').range(from, to)
  );
  for (const r of rows || []) {
    if (r?.id != null) ids.add(String(r.id));
    if (r?.order_number) ids.add(String(r.order_number));
  }
  return ids;
}

/**
 * List all files in a storage bucket
 */
const STORAGE_PAGE = 1000;
const MAX_FOLDER_DEPTH = 6;

async function listBucketFiles(bucket: string): Promise<{ path: string; size: number; createdAt: string }[]> {
  const files: { path: string; size: number; createdAt: string }[] = [];
  let truncated = false;

  // storage .list() caps at `limit` per call and returns ONE directory level only.
  // The previous version passed limit:1000 once at the root and recursed a single level,
  // so on order-attachments (12,362 objects) it saw the first 1000 and treated the rest as
  // absent, and it missed production-files entirely — those objects are all two levels deep
  // (orders/<id>/file). Both fixed: page by offset until a short page, recurse to depth.
  async function walk(prefix: string, depth: number): Promise<void> {
    if (depth > MAX_FOLDER_DEPTH) {
      truncated = true;
      logger.warn(`[Storage Cleanup] depth limit hit under ${bucket}/${prefix}`);
      return;
    }
    for (let offset = 0; ; offset += STORAGE_PAGE) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(prefix, { limit: STORAGE_PAGE, offset });
      if (error) {
        truncated = true;
        logger.error(`Failed to list ${bucket}/${prefix} at offset ${offset}`, error);
        return;
      }
      const page = data || [];
      for (const item of page) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) {
          files.push({ path, size: (item.metadata as any)?.size || 0, createdAt: item.created_at || '' });
        } else {
          await walk(path, depth + 1);
        }
      }
      if (page.length < STORAGE_PAGE) break;
    }
  }

  await walk('', 0);
  if (truncated) {
    // An incomplete listing is exactly how a live file gets mislabelled as orphaned.
    // Fail loudly rather than return a partial set.
    throw new Error(`Storage listing for "${bucket}" was incomplete — aborting scan rather than reporting a partial result.`);
  }
  return files;
}

/**
 * Scan all storage buckets and identify orphaned files
 */
export async function scanOrphanedFiles(): Promise<CleanupReport> {
  logger.info('[Storage Cleanup] Starting orphan scan...');

  const referencedUrls = await getAllReferencedUrls();
  const pathReferencedIds = await getPathReferencedIds();
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

      // A file counts as in use if EITHER a URL column points at it, OR its path carries
      // an order identifier as a segment (the production-files convention above).
      // Without the second test, 526 live production files read as orphaned.
      const byUrl = Array.from(referencedUrls).some(url =>
        url === publicUrl || url.includes(file.path)
      );
      const byPathConvention = file.path
        .split('/')
        .some(segment => pathReferencedIds.has(segment));
      const isReferenced = byUrl || byPathConvention;

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

  // remove() returns { data: [], error: null } when nothing matched — an RLS block or a
  // stale path looks EXACTLY like success. The previous version checked only `error` and
  // counted every requested path as deleted, which is why the UI reported success while
  // every file was still in storage. Count what actually came back.
  const DELETE_CHUNK = 100;
  const sizeByPath = new Map(files.map(f => [`${f.bucket}//${f.path}`, f.size || 0]));

  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += DELETE_CHUNK) {
      const slice = paths.slice(i, i + DELETE_CHUNK);
      const { data, error } = await supabase.storage.from(bucket).remove(slice);
      if (error) {
        logger.error(`[Storage Cleanup] Delete failed for ${slice.length} files in ${bucket}`, error);
        failed += slice.length;
        continue;
      }
      const removedPaths = new Set<string>((data || []).map((o: any) => o?.name).filter(Boolean));
      deleted += removedPaths.size;
      failed += slice.length - removedPaths.size;
      if (removedPaths.size < slice.length) {
        logger.error(`[Storage Cleanup] ${slice.length - removedPaths.size}/${slice.length} files in ${bucket} returned no error but were NOT deleted (RLS or stale path)`);
      }
      for (const name of removedPaths) freedBytes += sizeByPath.get(`${bucket}//${name}`) || 0;
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
