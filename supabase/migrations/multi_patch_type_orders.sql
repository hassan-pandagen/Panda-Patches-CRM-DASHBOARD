-- Multi-type orders (CEO decision, 9 Sept 2026).
-- Applied to production as migrations `add_additional_patch_types` and
-- `add_all_patch_types_generated`; kept here so the repo matches the database.
--
-- THE PROBLEM: a customer ordering "10 leather + 10 woven" had nowhere to record the second
-- type — the order form has one <select>. Agents worked around it by creating sibling orders
-- seconds apart (12 such jobs in the 8 months to Sept 2026, ~2-4% of orders), which re-keyed
-- the shipping address each time. PP-11337 ended up with "510 Park Ave" and no city, state or
-- zip while its sibling PP-11336 carried the full address; 3 of the 12 jobs had mismatched
-- addresses for the same delivery.
--
-- THE DECISION: keep it simple. ONE order, one amount, one payment link. Record the extra
-- types; the agent writes the per-type breakdown in Special Instructions.
--
-- WHAT DOES NOT CHANGE: patches_type stays the PRIMARY type with its exact current meaning.
-- The colour-match gate, digitizer routing, customs classification, production-email routing
-- (PVC gets no internal email) and the product-mix reports all keep reading it, untouched.
-- No existing row changes.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS additional_patch_types text[];

COMMENT ON COLUMN public.orders.additional_patch_types IS
  'Extra patch types on a multi-type order. patches_type remains the primary type and drives '
  'all routing, gating and reporting. Per-type quantities and details go in instructions. '
  'NULL or empty means a normal single-type order.';

-- The shape rules live in a function because a CHECK constraint cannot contain a subquery,
-- and "no duplicates" needs one. IMMUTABLE so the constraint can call it.
--
-- This guards SHAPE, not vocabulary. Deliberately no whitelist of patch types: patches_type
-- itself has never had one (34 distinct values in the table, "PVC" and "PVC Patches" among
-- them), and rejecting a spelling on the secondary field that the primary accepts happily
-- would be a rule that exists nowhere else in the system.
CREATE OR REPLACE FUNCTION public.additional_patch_types_ok(types text[], primary_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT types IS NULL
      OR (
        cardinality(types) <= 10
        -- No NULL members: a NULL renders as an empty chip and is a type that isn't there.
        AND array_position(types, NULL) IS NULL
        -- No blank or whitespace-only members, same reason.
        AND NOT EXISTS (SELECT 1 FROM unnest(types) t WHERE btrim(t) = '')
        -- No duplicates: "Leather" twice on one order is always a mistake.
        AND cardinality(types) = (SELECT count(DISTINCT t) FROM unnest(types) t)
        -- And never a repeat of the primary — that would show the same type twice.
        AND NOT (coalesce(primary_type, '') = ANY (types))
      );
$$;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_additional_patch_types_valid;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_additional_patch_types_valid
  CHECK (public.additional_patch_types_ok(additional_patch_types, patches_type));

CREATE INDEX IF NOT EXISTS idx_orders_additional_patch_types
  ON public.orders USING GIN (additional_patch_types);

-- ── Every type on the order, primary first ───────────────────────────────────────────────
-- So a "show me all Leather" filter finds an order whose leather is a SECONDARY type — the
-- exact order this feature exists to surface.
--
-- Generated rather than an .or() in the query because patch type values contain characters
-- that are PostgREST filter SYNTAX: 'Chenille Alphabet Package (A–Z)' has parentheses,
-- 'Glitter+Chenille' a plus. String-building
-- `patches_type.eq.<v>,additional_patch_types.cs.{<v>}` breaks on exactly those values, and
-- quoting them correctly is the kind of thing that works until the one type nobody tested
-- with. A generated column turns it into a single .contains(), which PostgREST encodes
-- itself. Mirrors the existing order_amount_sort pattern.
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS all_patch_types;

ALTER TABLE public.orders
  ADD COLUMN all_patch_types text[]
  GENERATED ALWAYS AS (
    CASE
      WHEN patches_type IS NULL OR btrim(patches_type) = ''
        THEN coalesce(additional_patch_types, ARRAY[]::text[])
      ELSE array_prepend(patches_type, coalesce(additional_patch_types, ARRAY[]::text[]))
    END
  ) STORED;

COMMENT ON COLUMN public.orders.all_patch_types IS
  'Generated: patches_type followed by additional_patch_types. Read-only — write to those two. '
  'Exists so the /orders patch-type filter can match a secondary type without string-building '
  'a PostgREST .or() out of values that contain parentheses and plus signs.';

CREATE INDEX IF NOT EXISTS idx_orders_all_patch_types
  ON public.orders USING GIN (all_patch_types);

-- Verified on application (1,216 rows): 1,211 produced all_patch_types = ARRAY[patches_type]
-- and the 5 rows with a null/blank patches_type produced {}. Setting additional_patch_types
-- equal to the primary on PP-11337 was rejected with SQLSTATE 23514, and the filter
-- `all_patch_types @> ARRAY['Leather']` returns the same 14 orders as the old
-- `patches_type = 'Leather'`, via Bitmap Index Scan on idx_orders_all_patch_types.
