-- ============================================================================
-- DURABLE WEB-CHECKOUT ORIGIN FLAG  (2026-08-05)
-- sales_agent='WEB_CHECKOUT' marks self-serve website orders, but it gets OVERWRITTEN
-- the moment an order is reassigned to a real agent — so the fact it came in self-serve
-- is lost, and "revenue earned via web checkout" can't be totalled after reassignment.
-- This flag is set ONCE at creation and never changed by reassignment, so the web-checkout
-- channel stays countable even after an agent takes the order over (the agent still earns
-- their commission separately via sales_agent — the two are independent).
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_web_checkout boolean NOT NULL DEFAULT false;

-- Backfill existing web-checkout-origin orders: those still unassigned (sales_agent='WEB_CHECKOUT')
-- PLUS any already reassigned to an agent that still carry the webhook's own square_checkout tag
-- (e.g. Manzoor's PP-11201 / PP-11195 / PP-11182). ~39 orders.
UPDATE public.orders
SET is_web_checkout = true
WHERE is_web_checkout = false
  AND ( sales_agent = 'WEB_CHECKOUT'
     OR attribution->>'source' = 'square_checkout' );

COMMENT ON COLUMN public.orders.is_web_checkout IS
  'True = order originated from self-serve website checkout (Square webhook FLOW A2). Durable — survives agent reassignment, unlike sales_agent. Drives the Web Checkout channel metric in Reports.';
