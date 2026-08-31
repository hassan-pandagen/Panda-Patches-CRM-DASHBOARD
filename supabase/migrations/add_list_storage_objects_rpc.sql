-- ============================================================================
-- list_storage_objects(bucket) — one query instead of ~1,500 round trips
-- 2026-08-31 · APPLIED via MCP the same day
--
-- The Storage Cleanup scanner enumerated buckets through the storage list API, which
-- returns ONE directory level per HTTP call. Measured live: order-attachments has 1,112
-- second-level folders and production-files another 404, so a *correct* recursive crawl
-- costs ~1,516 sequential requests — several minutes, during which the "Scan Storage"
-- button just spins and looks hung.
--
-- storage.objects already holds the full flat list, so reading it directly is one query
-- (2.3 ms). Request count for a full scan: ~1,516 → ~29.
--
-- Staff-gated in-function, matching the storage.objects SELECT policies from
-- security_lockdown_part4: customer-portal logins are `authenticated` too (583 of them vs
-- 12 staff), so the role alone is not a sufficient check.
--
-- NOTE: PostgREST caps set-returning function results at 1000 rows like any other query,
-- so callers MUST page this with .range() — the client uses fetchAllPaged.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_storage_objects(p_bucket text)
  RETURNS TABLE (path text, size bigint, created_at timestamptz)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT o.name,
         COALESCE((o.metadata->>'size')::bigint, 0),
         o.created_at
  FROM storage.objects o
  WHERE o.bucket_id = p_bucket
    AND EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid())
  ORDER BY o.name;
$$;

REVOKE ALL    ON FUNCTION public.list_storage_objects(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_storage_objects(text) TO authenticated, service_role;
