-- ============================================================================
-- SHIP-BY REMINDER DATE  (2026-08-05)
-- A soft, optional target date for when an order should ship. Purely a REMINDER —
-- deliberately SEPARATE from is_urgent / rush_date (which drive the urgent workflow).
-- Setting it does NOT mark the order urgent, does not block anything, and has no
-- required-field enforcement. The UI shows a gentle pill (neutral → amber near →
-- red if overdue & not yet shipped). Nullable, additive.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ship_by_date date;

COMMENT ON COLUMN public.orders.ship_by_date IS
  'Optional soft ship-by target (REMINDER only). Independent of is_urgent/rush_date; drives a visual pill, not the urgent workflow.';
