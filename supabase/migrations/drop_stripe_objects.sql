-- Teardown: remove all Stripe objects after migrating agent payment links to Square.
--
-- ⚠️ RUN ORDER MATTERS: only run this AFTER
--   (1) the `create-square-payment-link` edge function is deployed,
--   (2) the updated `square-payment-webhook` (with the QUOTE- flow) is deployed, and
--   (3) the new frontend (GeneratePaymentLinkModal → Square) is live.
-- The live frontend still calls create_stripe_payment_link_request / _quote_ / get_..response,
-- so dropping these before the frontend is pushed breaks the live "Generate Payment Link" button.
--
-- Verified (2026-07-01): no non-Stripe function/trigger references the stripe_* columns or tables.

BEGIN;

-- 1. Trigger + its function (cleared stripe_payment_link_id when a payment landed)
DROP TRIGGER IF EXISTS trg_clear_stripe_link_on_payment ON public.orders;
DROP FUNCTION IF EXISTS public.clear_stripe_link_on_payment();

-- 2. Agent payment-link RPCs (async request/response pattern) + Vault accessor
DROP FUNCTION IF EXISTS public.create_stripe_payment_link_request(bigint, numeric, text);
DROP FUNCTION IF EXISTS public.create_stripe_quote_payment_link_request(bigint, numeric, text);
DROP FUNCTION IF EXISTS public.get_stripe_payment_link_response(bigint);
DROP FUNCTION IF EXISTS private.get_stripe_secret();

-- 3. Stripe tables (webhook dedup, async request store, test log)
DROP TABLE IF EXISTS public.stripe_payment_link_requests;
DROP TABLE IF EXISTS public.stripe_webhook_events;
DROP TABLE IF EXISTS public._stripe_test_log;

-- 4. Stripe columns on orders (no remaining code references them)
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS stripe_session_id,
  DROP COLUMN IF EXISTS stripe_payment_intent_id,
  DROP COLUMN IF EXISTS stripe_payment_link_id;

COMMIT;

-- 5. Vault secret — run separately (outside the txn above):
--    DELETE FROM vault.secrets WHERE name = 'stripe_secret_key';
