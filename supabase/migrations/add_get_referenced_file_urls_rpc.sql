-- get_referenced_file_urls() — authoritative "what files are still in use"
-- 2026-08-31 · APPLIED via MCP
--
-- The Storage Cleanup scanner built this list client-side from TWO tables (orders, quotes)
-- and so missed every URL held elsewhere. Measured live: 6 files it offered for PERMANENT
-- deletion were still referenced — 5 by payment_form_tokens, 1 by square_pending_orders —
-- and TWO belonged to an unused, unexpired payment link (token 258), i.e. artwork a customer
-- was about to see.
--
-- Centralising server-side means a caller cannot silently miss a source, and the list covers
-- every row rather than the client's first 1000.
--
-- square_pending_orders.order_data is free-form jsonb whose URL key is artwork_url today. It
-- is regex-scanned over the WHOLE document rather than by key name — an earlier check that
-- guessed the key (mockup_urls) found 5 instead of 6. A future key holding a storage URL is
-- now picked up automatically rather than becoming the next silent deletion.
--
-- Staff-gated in-function. PostgREST caps set-returning functions at 1000 rows — page it.
CREATE OR REPLACE FUNCTION public.get_referenced_file_urls()
  RETURNS TABLE (url text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT DISTINCT u FROM (
    SELECT unnest(coalesce(o.production_file_urls,'{}') || coalesce(o.shipping_attachment_urls,'{}')
                || coalesce(o.customer_attachment_urls,'{}') || coalesce(o.mockup_urls,'{}')
                || coalesce(o.redo_attachments,'{}')) AS u FROM public.orders o
    UNION ALL
    SELECT unnest(coalesce(q.mockup_urls,'{}') || coalesce(q.customer_attachment_urls,'{}')) FROM public.quotes q
    UNION ALL
    SELECT unnest(coalesce(t.mockup_urls,'{}') || coalesce(t.customer_attachment_urls,'{}')) FROM public.payment_form_tokens t
    UNION ALL
    SELECT (regexp_matches(sp.order_data::text,
             'https?://[^"[:space:]]+/storage/v1/object/public/[^"[:space:]]+','g'))[1]
      FROM public.square_pending_orders sp
  ) x
  WHERE u IS NOT NULL AND u <> ''
    AND EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid())
  ORDER BY u;
$$;

REVOKE ALL    ON FUNCTION public.get_referenced_file_urls() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referenced_file_urls() TO authenticated, service_role;
