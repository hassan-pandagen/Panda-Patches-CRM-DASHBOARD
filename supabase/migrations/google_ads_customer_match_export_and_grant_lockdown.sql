-- Applied 2026-07-18 via Supabase MCP (remote version: google_ads_customer_match_export_and_grant_lockdown)
-- Customer Match audience export for Google Ads Data Manager, plus:
--  * normalize_phone_e164() — conservative E.164 normalizer (null over wrong)
--  * customer_privacy_optouts — minimal erasure/opt-out registry the view honors
--  * grant lockdown: new view readable ONLY by the Data Manager _ro roles, and the
--    same revoke retrofitted onto the existing Data Manager export objects.

-- 1) Conservative phone normalizer. Rules (agreed 2026-07-18): strip to digits;
--    10 digits -> +1########## ; 11 starting with 1 -> +1... ; a field holding two
--    jammed-together numbers -> first valid NANP sequence; anything else -> NULL.
--    A wrong phone hurts Customer Match quality, a NULL one doesn't.
CREATE OR REPLACE FUNCTION public.normalize_phone_e164(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN d ~ '^[2-9]'  AND length(d) = 10          THEN '+1' || d
    WHEN d ~ '^1[2-9]' AND length(d) = 11          THEN '+'  || d
    WHEN d ~ '^[2-9]'  AND length(d) IN (20, 21)   THEN '+1' || left(d, 10)
    WHEN d ~ '^1[2-9]' AND length(d) IN (21, 22)   THEN '+'  || left(d, 11)
    ELSE NULL
  END
  FROM (SELECT regexp_replace(raw, '[^0-9]', '', 'g') AS d) s
$$;

COMMENT ON FUNCTION public.normalize_phone_e164(text) IS
  'Conservative E.164 (+1) normalizer for messy CRM phone fields. Returns NULL rather than guessing. Reusable by the conversion export views.';

-- 2) Erasure/opt-out registry. Support inserts rows manually (SQL editor / service
--    role) until there is UI. The Customer Match view excludes anyone listed here.
CREATE TABLE public.customer_privacy_optouts (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL CHECK (email = lower(btrim(email))),
  customer_id   uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  opted_out_at  timestamptz NOT NULL DEFAULT now(),
  reason        text
);

COMMENT ON TABLE public.customer_privacy_optouts IS
  'People who requested erasure/opt-out from ad audiences. Excluded from google_ads_data_manager_export_customers. Email must be stored lowercase/trimmed (enforced by CHECK).';

ALTER TABLE public.customer_privacy_optouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_privacy_optouts FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.customer_privacy_optouts_id_seq FROM anon, authenticated;

-- 3) The Customer Match export view.
--    Sources: customers table (one row per person, kept to those with >=1 non-deleted
--    order) UNION leads from quotes in the last 540 days (same partial/bot filters as
--    the leads conversion view). Dedupe by email, customers row wins over quote row.
CREATE VIEW public.google_ads_data_manager_export_customers
WITH (security_barrier = true) AS
WITH person AS (
  SELECT c.id AS customer_id,
         c.normalized_email AS email,
         c.full_name,
         c.phone,
         c.country AS country_raw,
         c.default_shipping_address AS address,
         1 AS src_rank
  FROM public.customers c
  WHERE c.merged_into_id IS NULL
    AND c.is_active
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE lower(btrim(o.customer_email)) = c.normalized_email
        AND o.deleted_at IS NULL)
  UNION ALL
  SELECT NULL::uuid,
         lower(btrim(q.customer_email)),
         q.customer_name,
         q.customer_phone,
         NULL,
         q.shipping_address,
         2
  FROM public.quotes q
  WHERE q.created_at >= (now() - interval '540 days')
    AND q.customer_email IS NOT NULL
    AND btrim(q.customer_email) <> ''
    AND (q.instructions IS NULL OR (q.instructions NOT LIKE '[PARTIAL LEAD%'
         AND q.instructions NOT LIKE '[SUSPECTED BOT]%'))
),
deduped AS (
  SELECT DISTINCT ON (p.email) p.*
  FROM person p
  WHERE p.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    AND NOT EXISTS (
      SELECT 1 FROM public.customer_privacy_optouts x
      WHERE lower(btrim(x.email)) = p.email
         OR (p.customer_id IS NOT NULL AND x.customer_id = p.customer_id))
  ORDER BY p.email, p.src_rank
),
shaped AS (
  SELECT d.email,
         public.normalize_phone_e164(d.phone) AS phone,
         n.words,
         COALESCE(
           CASE upper(btrim(COALESCE(d.country_raw, '')))
             WHEN 'USA' THEN 'US' WHEN 'US' THEN 'US' WHEN 'UNITED STATES' THEN 'US'
             WHEN 'UK' THEN 'GB' WHEN 'UNITED KINGDOM' THEN 'GB'
             WHEN 'CANADA' THEN 'CA' WHEN 'NEW ZEALAND' THEN 'NZ'
             WHEN 'FRANCE' THEN 'FR' WHEN 'GERMANY' THEN 'DE'
             WHEN 'AUSTRALIA' THEN 'AU' WHEN 'IRELAND' THEN 'IE'
             WHEN 'ICELAND' THEN 'IS'
             ELSE NULL
           END,
           -- country missing: infer US only on strong evidence in the address
           CASE
             WHEN d.address ~* '\y(usa|u\.s\.a|united states)\y' THEN 'US'
             WHEN d.address ~ '[A-Za-z]{2}\.?,?[[:space:]]+\d{5}(-\d{4})?[^0-9A-Za-z]*$' THEN 'US'
             ELSE NULL
           END) AS country,
         d.address
  FROM deduped d
  CROSS JOIN LATERAL (
    SELECT regexp_split_to_array(
             lower(btrim(regexp_replace(COALESCE(d.full_name, ''), '[[:space:]]+', ' ', 'g'))),
             ' ') AS words
  ) n
)
SELECT s.email,
       s.phone,
       NULLIF(s.words[1], '') AS first_name,
       CASE WHEN array_length(s.words, 1) >= 2
            THEN s.words[array_length(s.words, 1)] END AS last_name,
       s.country,
       CASE WHEN s.country = 'US' THEN
         (SELECT t.m[1]
          FROM regexp_matches(s.address, '\y(\d{5}(?:-\d{4})?)\y', 'g') WITH ORDINALITY AS t(m, ord)
          ORDER BY t.ord DESC
          LIMIT 1)
       END AS zip
FROM shaped s;

COMMENT ON VIEW public.google_ads_data_manager_export_customers IS
  'Google Ads Data Manager Customer Match feed: transacted customers + leads from the last 540 days, deduped by email, minus customer_privacy_optouts. Readable only by the Data Manager _ro roles.';

-- 4) Lock the new view down from day one.
REVOKE ALL ON public.google_ads_data_manager_export_customers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.google_ads_data_manager_export_customers
  TO google_ads_data_manager_ro, google_ads_data_manager_crm_ro;
GRANT EXECUTE ON FUNCTION public.normalize_phone_e164(text)
  TO google_ads_data_manager_ro, google_ads_data_manager_crm_ro;

-- 5) Retrofit the same lockdown onto the existing Data Manager objects.
--    Safe against the live connections: Data Manager speaks the Postgres protocol and
--    anon/authenticated are NOLOGIN, so it can only be authenticating as the _ro roles,
--    whose explicit SELECT grants are untouched. The CRM app never references these
--    objects, and the google-ads-conversions edge function writes google_ads_upload_log
--    as service_role, which keeps its grants.
REVOKE ALL ON public.google_ads_data_manager_export        FROM anon, authenticated;
REVOKE ALL ON public.google_ads_data_manager_export_leads  FROM anon, authenticated;
REVOKE ALL ON public.google_ads_data_manager_export_crm    FROM anon, authenticated;
REVOKE ALL ON public.google_ads_data_manager_export_crm_src FROM anon, authenticated;
REVOKE ALL ON public.google_ads_upload_log                 FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.google_ads_upload_log_id_seq FROM anon, authenticated;
