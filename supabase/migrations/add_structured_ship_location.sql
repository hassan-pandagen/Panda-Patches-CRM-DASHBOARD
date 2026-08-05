-- ============================================================================
-- STRUCTURED SHIPPING LOCATION  (geo-data baseline, 2026-07-31)
-- shipping_address is a free-text blob (names/emails/phones mixed in, inconsistent
-- "City, ST ZIP" formats) — unparseable for metro analytics. Add clean, separate
-- city/state/postal columns so geo analytics + future city pages have reliable data.
-- Populated going forward by: the website checkout (structured address it already collects,
-- sent via the Square-webhook order_data) and the agent order form's new structured fields.
-- `country` already exists (add_country_to_orders.sql) and is ~87% captured on recent orders.
-- Nullable + additive: nothing reads these until populated; no backfill (the historical
-- free-text can't be reliably parsed — that's why we're capturing structured going forward).
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ship_city   text,
  ADD COLUMN IF NOT EXISTS ship_state  text,
  ADD COLUMN IF NOT EXISTS ship_postal text;

COMMENT ON COLUMN public.orders.ship_city IS
  'Structured shipping city (clean, for metro analytics). Free-text shipping_address stays the full/display address. Captured from website checkout + agent form going forward; not backfilled.';

-- Metro grouping index (city + state) for future per-metro reporting / the ≥20 city-page gate.
CREATE INDEX IF NOT EXISTS idx_orders_ship_city_state
  ON public.orders (lower(btrim(ship_state)), lower(btrim(ship_city)))
  WHERE ship_city IS NOT NULL;

-- ============================================================================
-- OPTIONAL ORGANIZATION FIELD  (org-buyer self-identification, 2026-07-31)
-- The CRM records the individual purchaser, not their organization, so we can't
-- back org-type claims (fire depts / agencies / teams / promo cos) on the city pages.
-- customer_profiles.company_name exists for portal customers, but agent-entered quotes/
-- orders have nowhere to record the buying organization. Add an optional org field to
-- BOTH quotes and orders so org buyers self-identify at intake; once this accrues,
-- org-type reporting (and the deferred city-page org line) becomes possible.
-- Nullable + additive; nothing depends on it until populated.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS organization text;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS organization text;

COMMENT ON COLUMN public.orders.organization IS
  'Optional buying organization (self-identified at intake). Distinct from customer_name (the individual). Enables future org-type analytics; not backfilled.';
