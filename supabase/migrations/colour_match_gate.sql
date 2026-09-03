-- ============================================================================
-- Colour-match gate — chenille letter packages (Alphabet A–Z $150, Numbers 0–9 $120)
-- CEO decision 3 Sept 2026. Blocks the letter-package launch.
--
-- These sets have no mockup cycle: standard glyphs, no artwork to approve. The colour
-- match is the ONLY approval step between a customer-typed string and 26 pieces of yarn.
-- A $150–200 set made in a guessed colour is a remake plus shipping, in season.
--
-- The five columns are the website's payload (already written to
-- square_pending_orders.order_data); `matched_yarn` is the one the supervisor fills.
--
-- ── Why a TRIGGER and not a client-side check ───────────────────────────────
-- Order status is written by a plain `supabase.from('orders').update(...)` from the
-- BROWSER (src/services/orderService.ts → updateOrderDetails). There is no server-side
-- transition function to hook. Any authenticated staff member can PATCH the row directly
-- through PostgREST — the digitizer-brief acceptance test does exactly that from the
-- console. So a check in updateOrderDetails is a disabled button, not a gate.
--
-- This trigger is the gate. It holds for the CRM UI, the Square webhook, a direct
-- PostgREST call, service_role, and the SQL editor alike.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS colour_match_required  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS colour_match_status    text,
  ADD COLUMN IF NOT EXISTS customer_colour_input  text,
  ADD COLUMN IF NOT EXISTS customer_colour_hex    text,
  ADD COLUMN IF NOT EXISTS matched_yarn           text;

COMMENT ON COLUMN public.orders.colour_match_required IS
  'Letter/number package: the colour match is the only approval step. Arms the IN_PRODUCTION gate.';
COMMENT ON COLUMN public.orders.customer_colour_input IS
  'Verbatim customer text — a Pantone code, a colour name, or a hex. NEVER normalised: "PMS 186 C" and "royal blue" must survive intact for the supervisor to match against.';
COMMENT ON COLUMN public.orders.customer_colour_hex IS
  'Parsed only when the input was a hex; NULL otherwise. A swatch aid, not the source of truth.';
COMMENT ON COLUMN public.orders.matched_yarn IS
  'The supervisor''s chosen yarn. Empty = production is blocked. Changes are logged by trigger_log_order_changes.';

-- 'standard' → one-click confirm, no email. 'needs-customer-confirmation' → closest-match
-- email + confirm link. NULL for every order that is not a letter package.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_colour_match_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_colour_match_status_check
  CHECK (colour_match_status IS NULL
         OR colour_match_status IN ('standard', 'needs-customer-confirmation'));

-- ── THE GATE ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_colour_match_before_production()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- `IS TRUE`, not `= true`: colour_match_required is NOT NULL today, but if a future
  -- migration ever relaxes that, `NULL = true` is NULL and IF treats NULL as false —
  -- the guard would silently stop guarding. `IS TRUE` cannot degrade that way.
  IF NEW.status = 'IN_PRODUCTION'
     AND NEW.colour_match_required IS TRUE
     AND coalesce(btrim(NEW.matched_yarn), '') = ''
  THEN
    RAISE EXCEPTION
      'Colour match required before production. Order % — customer asked for "%". Set matched_yarn first.',
      coalesce(NEW.order_number, '(new order)'),
      coalesce(NEW.customer_colour_input, 'no colour recorded')
      USING ERRCODE = 'check_violation',
            HINT = 'Confirm the yarn on the order page, then move it to In Production.';
  END IF;
  RETURN NEW;
END;
$function$;

-- Fires on the RESULTING row, not only on the transition: a row cannot come to rest in
-- IN_PRODUCTION without a yarn by any path, including a direct INSERT.
DROP TRIGGER IF EXISTS trg_guard_colour_match_before_production ON public.orders;
CREATE TRIGGER trg_guard_colour_match_before_production
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_colour_match_before_production();

-- Supervisor queue: the awaiting-match set is tiny against ~1,200 orders.
CREATE INDEX IF NOT EXISTS idx_orders_colour_match_pending
  ON public.orders (created_at DESC)
  WHERE colour_match_required AND coalesce(btrim(matched_yarn), '') = '';
