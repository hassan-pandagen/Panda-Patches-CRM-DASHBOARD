// src/services/storageCleanup.ts - Storage Cleanup & Orphan Detection
import { supabase } from './supabaseClient';
import { logger } from './logger';
import { fetchAllPaged } from '../utils/fetchAllPaged';

const BUCKETS = ['order-attachments', 'production-files', 'quote-mockups'] as const;

// Never offer a recently-uploaded file for deletion, even if nothing references it yet.
// Uploads land in storage BEFORE the quote/order row that will reference them is saved, so
// there is a window where an in-flight submission's artwork looks orphaned. Measured: ~20
// unreferenced files appear per day (abandoned quote forms), so the window is hit often
// enough to matter. Seven days costs ~6% of the reclaimable space and removes the race
// entirely — 155 of 2,558 orphans are younger than this.
const ORPHAN_GRACE_DAYS = 7;

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
    // Strip any ?query / #fragment before decoding. Matching is now an exact Set lookup
    // rather than a substring scan, so a trailing "?t=123" would silently turn a live file
    // into a false orphan. None exist today (checked: 0 of 9,905 referenced URLs) — this
    // keeps it that way.
    const raw = url.substring(idx + marker.length).split('?')[0].split('#')[0];
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/**
 * Every file URL still referenced anywhere in the database.
 *
 * Sourced from ONE server-side RPC rather than assembled client-side. The previous version
 * queried orders + quotes only, and so never saw URLs held in payment_form_tokens or
 * square_pending_orders — 6 files were offered for permanent deletion while still referenced,
 * two of them artwork on an unused, unexpired payment link. A client-side list can silently
 * miss a table; a server-side one is the single place to add a source.
 *
 * Still paged: PostgREST caps set-returning functions at 1000 rows like anything else.
 */
async function getAllReferencedUrls(): Promise<Set<string>> {
  const rows = await fetchAllPaged<any>((from, to) =>
    supabase.rpc('get_referenced_file_urls').range(from, to)
  );
  const urls = new Set<string>();
  for (const r of rows || []) {
    const u = typeof r === 'string' ? r : r?.url;
    if (u) urls.add(u);
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
// One RPC read of storage.objects, paged, instead of crawling the storage list API.
//
// The list API returns ONE directory level per HTTP call. order-attachments has 1,112
// second-level folders and production-files another 404, so a correct recursive crawl cost
// ~1,516 sequential requests — several minutes, during which the Scan button just spins.
// list_storage_objects() returns the flat list in one query; PostgREST still caps at 1000
// rows, hence fetchAllPaged.
async function listBucketFiles(bucket: string): Promise<{ path: string; size: number; createdAt: string }[]> {
  const rows = await fetchAllPaged<any>((from, to) =>
    supabase.rpc('list_storage_objects', { p_bucket: bucket }).range(from, to)
  );
  return (rows || []).map((r: any) => ({
    path: r.path,
    size: Number(r.size) || 0,
    createdAt: r.created_at || '',
  }));
}

/**
 * Scan all storage buckets and identify orphaned files
 */
export async function scanOrphanedFiles(): Promise<CleanupReport> {
  logger.info('[Storage Cleanup] Starting orphan scan...');

  const referencedUrls = await getAllReferencedUrls();
  const pathReferencedIds = await getPathReferencedIds();

  // Index the referenced URLs by "<bucket>//<path>" ONCE. The previous check ran
  //   Array.from(referencedUrls).some(url => url.includes(file.path))
  // per file — with 12,405 files against 9,868 referenced URLs that is ~122 million
  // substring comparisons on the main thread, which locks the tab. This is O(1) per file.
  const referencedPathKeys = new Set<string>();
  for (const url of referencedUrls) {
    for (const b of BUCKETS) {
      const path = extractFilePath(url, b);
      if (path) { referencedPathKeys.add(`${b}//${path}`); break; }
    }
  }
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
      // A file counts as in use if EITHER a URL column points at it, OR its path carries
      // an order identifier as a segment (the production-files convention above).
      // Without the second test, 526 live production files read as orphaned.
      const byUrl = referencedPathKeys.has(`${bucket}//${file.path}`);
      const byPathConvention = file.path
        .split('/')
        .some(segment => pathReferencedIds.has(segment));

      // Too new to judge: an upload whose row has not been saved yet is indistinguishable
      // from an abandoned one. Treat it as in use rather than risk deleting live artwork.
      const ageMs = file.createdAt ? Date.now() - new Date(file.createdAt).getTime() : Infinity;
      const tooRecent = ageMs < ORPHAN_GRACE_DAYS * 86400_000;

      const isReferenced = byUrl || byPathConvention || tooRecent;

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
