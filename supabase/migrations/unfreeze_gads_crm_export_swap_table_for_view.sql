-- Applied 2026-07-19 via Supabase MCP (remote version: unfreeze_gads_crm_export_swap_table_for_view)
-- The "Quote Converted to Order (CRM)" Data Manager connection reads
-- google_ads_data_manager_export_crm, which migration test_crm_export_as_real_table
-- left as a STATIC table (a setup-day test, frozen at 2026-07-15, nothing refreshing
-- it) while the live query sits in the _crm_src view. Replace the table with a thin
-- passthrough view of the same name and identical column names/order, so the daily
-- sync serves current data again. Same-name/same-columns means the Data Manager field
-- mapping is untouched; Google dedupes overlapping rows on Transaction ID (order_number).

DROP TABLE public.google_ads_data_manager_export_crm;

CREATE VIEW public.google_ads_data_manager_export_crm
WITH (security_barrier = true) AS
SELECT order_number,
       gclid,
       gbraid,
       wbraid,
       conversion_name,
       conversion_time,
       conversion_value,
       currency,
       hashed_email,
       hashed_phone
FROM public.google_ads_data_manager_export_crm_src;

COMMENT ON VIEW public.google_ads_data_manager_export_crm IS
  'Live passthrough of google_ads_data_manager_export_crm_src for the Data Manager "Quote Converted to Order (CRM)" connection. Replaced the frozen test table 2026-07-19.';

-- Same lockdown as the rest of the export objects: the postgres default ACL still
-- auto-grants anon/authenticated on new relations, so revoke explicitly.
REVOKE ALL ON public.google_ads_data_manager_export_crm FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.google_ads_data_manager_export_crm TO google_ads_data_manager_crm_ro;
