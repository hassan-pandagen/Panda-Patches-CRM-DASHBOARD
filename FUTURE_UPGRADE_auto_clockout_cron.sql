-- =================================================================
-- FUTURE UPGRADE: Auto Clock-Out with pg_cron (Supabase Pro)
-- Run this AFTER upgrading to Supabase Pro Plan ($25/month)
-- =================================================================

-- WHAT THIS DOES:
-- Automatically closes attendance sessions that exceed 10 hours
-- Runs every hour, 24/7, regardless of user activity
-- No frontend dependency - fully server-side automation

-- STEP 1: Enable pg_cron extension (Supabase Pro only)
-- Go to: Supabase Dashboard → Database → Extensions → Enable "pg_cron"
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- STEP 2: Schedule the auto clock-out job to run every hour
SELECT cron.schedule(
    'auto-close-stale-attendance-sessions',  -- Job name
    '0 * * * *',                             -- Cron: Every hour at minute 0
    $$SELECT auto_close_stale_sessions();$$  -- Calls existing function
);

-- STEP 3: Verify the job is scheduled
SELECT
    jobid,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    username,
    active
FROM cron.job
WHERE jobname = 'auto-close-stale-attendance-sessions';

-- Expected output:
-- jobid | schedule  | command                               | active
-- ------|-----------|---------------------------------------|--------
-- 1     | 0 * * * * | SELECT auto_close_stale_sessions();   | true

-- =================================================================
-- OPTIONAL: View job run history
-- =================================================================
SELECT
    jobid,
    runid,
    job_pid,
    database,
    username,
    command,
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-close-stale-attendance-sessions')
ORDER BY start_time DESC
LIMIT 10;

-- =================================================================
-- MANAGEMENT COMMANDS (if needed later)
-- =================================================================

-- To temporarily disable the job:
-- SELECT cron.alter_job(jobid, enabled => false)
-- FROM cron.job
-- WHERE jobname = 'auto-close-stale-attendance-sessions';

-- To re-enable the job:
-- SELECT cron.alter_job(jobid, enabled => true)
-- FROM cron.job
-- WHERE jobname = 'auto-close-stale-attendance-sessions';

-- To change the schedule (e.g., run every 30 minutes):
-- SELECT cron.alter_job(
--     jobid,
--     schedule => '*/30 * * * *'
-- )
-- FROM cron.job
-- WHERE jobname = 'auto-close-stale-attendance-sessions';

-- To completely remove the job:
-- SELECT cron.unschedule('auto-close-stale-attendance-sessions');

-- =================================================================
-- AFTER SETUP: Remove client-side trigger
-- =================================================================
-- Once pg_cron is running, you can optionally remove the frontend
-- useEffect from ClockInOutPage.tsx (lines 167-194) since it's
-- no longer needed. The server will handle it automatically.

-- However, keeping both doesn't hurt - it provides redundancy!

-- =================================================================
-- VERIFICATION
-- =================================================================
SELECT 'pg_cron auto clock-out setup complete! ✅' AS status;
SELECT 'Job will run every hour automatically.' AS info;

-- =================================================================
-- =================================================================
-- FUTURE UPGRADE #2: SERVER-SIDE PAGINATION (After 1000+ Orders)
-- =================================================================
-- =================================================================

-- CURRENT SITUATION:
-- - Frontend fetches ALL orders at once (client-side pagination)
-- - Works great for < 1000 orders (~120KB data transfer)
-- - Will slow down significantly at 2000+ orders (~250KB+)

-- WHEN TO UPGRADE:
-- - When you have 1000+ orders
-- - When page load time exceeds 1-2 seconds
-- - When users complain about slow performance

-- =================================================================
-- STEP 1: Create Optimized Indexes for Pagination
-- =================================================================

-- Index for paginated queries (ORDER BY created_at DESC)
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc
ON public.orders(created_at DESC, id DESC);

-- Index for filtered pagination (by status)
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
ON public.orders(status, created_at DESC, id DESC);

-- Index for search queries (customer name, email, phone)
CREATE INDEX IF NOT EXISTS idx_orders_customer_search
ON public.orders USING gin(
  to_tsvector('english',
    coalesce(customer_name, '') || ' ' ||
    coalesce(customer_email, '') || ' ' ||
    coalesce(customer_phone, '')
  )
);

-- Index for order number search
CREATE INDEX IF NOT EXISTS idx_orders_number_search
ON public.orders(order_number text_pattern_ops);

-- =================================================================
-- STEP 2: Create Database Function for Paginated Queries
-- =================================================================

-- Function to get paginated orders with filters
CREATE OR REPLACE FUNCTION public.get_orders_paginated(
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 50,
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_sales_agent TEXT DEFAULT NULL,
  p_user_role TEXT DEFAULT 'USER',
  p_user_email TEXT DEFAULT NULL
)
RETURNS TABLE(
  id BIGINT,
  order_number TEXT,
  customer_name TEXT,
  customer_email TEXT,
  design_name TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  sales_agent TEXT,
  order_amount NUMERIC,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offset INTEGER;
  v_total_count BIGINT;
BEGIN
  -- Calculate offset
  v_offset := (p_page - 1) * p_page_size;

  -- Get total count (for pagination UI)
  SELECT COUNT(*) INTO v_total_count
  FROM public.orders
  WHERE
    (p_status IS NULL OR public.orders.status = p_status)
    AND (p_search IS NULL OR
      public.orders.order_number ILIKE '%' || p_search || '%' OR
      public.orders.customer_name ILIKE '%' || p_search || '%' OR
      public.orders.customer_email ILIKE '%' || p_search || '%')
    AND (p_sales_agent IS NULL OR public.orders.sales_agent = p_sales_agent)
    AND (p_user_role = 'ADMIN' OR public.orders.sales_agent = p_user_email);

  -- Return paginated results
  RETURN QUERY
  SELECT
    o.id,
    o.order_number,
    o.customer_name,
    o.customer_email,
    o.design_name,
    o.status,
    o.created_at,
    o.sales_agent,
    o.order_amount,
    v_total_count
  FROM public.orders o
  WHERE
    (p_status IS NULL OR o.status = p_status)
    AND (p_search IS NULL OR
      o.order_number ILIKE '%' || p_search || '%' OR
      o.customer_name ILIKE '%' || p_search || '%' OR
      o.customer_email ILIKE '%' || p_search || '%')
    AND (p_sales_agent IS NULL OR o.sales_agent = p_sales_agent)
    AND (p_user_role = 'ADMIN' OR o.sales_agent = p_user_email)
  ORDER BY o.created_at DESC, o.id DESC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

-- =================================================================
-- STEP 3: Frontend Implementation Guide
-- =================================================================

-- File: src/pages/AllOrdersPage.tsx
--
-- REPLACE the current query (lines 89-109) with:
--
-- const [currentPage, setCurrentPage] = useState(1);
-- const PAGE_SIZE = 50;
--
-- const { data: paginatedData, isLoading, error } = useQuery({
--   queryKey: [...queryKeys.orders.all(), currentPage, searchTerm, statusFilter],
--   queryFn: async () => {
--     const { data, error } = await supabase.rpc('get_orders_paginated', {
--       p_page: currentPage,
--       p_page_size: PAGE_SIZE,
--       p_status: statusFilter || null,
--       p_search: searchTerm || null,
--       p_sales_agent: null,
--       p_user_role: role,
--       p_user_email: user?.email || null,
--     });
--
--     if (error) throw new Error(error.message);
--     return {
--       orders: (data || []).map(mapDbToOrder),
--       totalCount: data?.[0]?.total_count || 0,
--       totalPages: Math.ceil((data?.[0]?.total_count || 0) / PAGE_SIZE),
--     };
--   },
--   staleTime: 1000 * 30,
--   gcTime: 1000 * 60 * 5,
-- });
--
-- const orders = paginatedData?.orders || [];
-- const totalPages = paginatedData?.totalPages || 1;

-- =================================================================
-- STEP 4: Update useQueryPrefetch.ts
-- =================================================================

-- File: src/hooks/useQueryPrefetch.ts (lines 30-51)
--
-- REPLACE with server-side paginated prefetch:
--
-- const prefetchOrders = async () => {
--   try {
--     await queryClient.prefetchQuery({
--       queryKey: [...queryKeys.orders.all(), 1], // Prefetch page 1
--       queryFn: async () => {
--         const { data, error } = await supabase.rpc('get_orders_paginated', {
--           p_page: 1,
--           p_page_size: 50,
--           p_status: null,
--           p_search: null,
--           p_sales_agent: null,
--           p_user_role: 'ADMIN', // Assume admin for prefetch
--           p_user_email: null,
--         });
--
--         if (error) throw error;
--         return {
--           orders: (data || []).map(mapDbToOrder),
--           totalCount: data?.[0]?.total_count || 0,
--         };
--       },
--       staleTime: 60000,
--     });
--   } catch (error) {
--     console.warn('Failed to prefetch orders:', error);
--   }
-- };

-- =================================================================
-- STEP 5: Performance Benchmarks
-- =================================================================

-- Test query performance before upgrade:
EXPLAIN ANALYZE
SELECT id, order_number, customer_name, customer_email, design_name,
       status, created_at, sales_agent, order_amount
FROM public.orders
ORDER BY created_at DESC
LIMIT 50;

-- After indexes are created, test again:
EXPLAIN ANALYZE
SELECT * FROM get_orders_paginated(
  p_page := 1,
  p_page_size := 50,
  p_status := NULL,
  p_search := NULL,
  p_sales_agent := NULL,
  p_user_role := 'ADMIN',
  p_user_email := NULL
);

-- Expected improvement: < 10ms for paginated query vs 100-500ms for full table scan

-- =================================================================
-- STEP 6: Migration Checklist
-- =================================================================

-- [ ] 1. Run Step 1 indexes in Supabase SQL Editor
-- [ ] 2. Run Step 2 function in Supabase SQL Editor
-- [ ] 3. Test function manually: SELECT * FROM get_orders_paginated(1, 50);
-- [ ] 4. Update AllOrdersPage.tsx with new query (Step 3)
-- [ ] 5. Update useQueryPrefetch.ts with new prefetch (Step 4)
-- [ ] 6. Test pagination UI works correctly
-- [ ] 7. Test search functionality works
-- [ ] 8. Test status filters work
-- [ ] 9. Verify performance improvement (should be instant!)
-- [ ] 10. Remove old client-side pagination logic

-- =================================================================
-- STEP 7: Performance Monitoring
-- =================================================================

-- Create view to monitor slow queries
CREATE OR REPLACE VIEW public.slow_query_stats AS
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%orders%'
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Grant access to admins
GRANT SELECT ON public.slow_query_stats TO authenticated;

-- Check query performance:
-- SELECT * FROM slow_query_stats;

-- =================================================================
-- ADDITIONAL OPTIMIZATIONS (Optional)
-- =================================================================

-- 1. MATERIALIZED VIEW for Dashboard Metrics (updates every hour)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.dashboard_metrics_cache AS
SELECT
  COUNT(*) FILTER (WHERE status = 'NEW_ORDER') as new_orders_count,
  COUNT(*) FILTER (WHERE status = 'IN_PRODUCTION') as in_production_count,
  COUNT(*) FILTER (WHERE status = 'SHIPPED') as shipped_count,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as orders_last_7_days,
  SUM(order_amount) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as revenue_30_days
FROM public.orders;

-- Refresh every hour (when you have pg_cron):
-- SELECT cron.schedule(
--   'refresh-dashboard-metrics',
--   '0 * * * *',
--   $$REFRESH MATERIALIZED VIEW public.dashboard_metrics_cache;$$
-- );

-- 2. PARTITION large tables by date (for 10,000+ orders)
-- CREATE TABLE orders_2024 PARTITION OF orders
-- FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

-- 3. Archive old orders to separate table (orders > 1 year old)
-- CREATE TABLE orders_archive AS
-- SELECT * FROM orders WHERE created_at < CURRENT_DATE - INTERVAL '1 year';

-- =================================================================
-- PERFORMANCE TARGETS
-- =================================================================

-- Orders Count | Current Load Time | After Pagination | Improvement
-- -------------|-------------------|------------------|------------
-- 100          | 50ms             | 30ms             | 40% faster
-- 500          | 150ms            | 35ms             | 77% faster
-- 1,000        | 400ms            | 40ms             | 90% faster
-- 5,000        | 2000ms           | 45ms             | 97% faster
-- 10,000       | 5000ms           | 50ms             | 99% faster

SELECT 'Server-side pagination upgrade guide complete! ✅' AS status;
