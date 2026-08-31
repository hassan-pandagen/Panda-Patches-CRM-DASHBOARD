-- Defence in depth on tables protected by RLS alone (lint: rls_enabled_no_policy)
-- 2026-09-01 · APPLIED via MCP
--
-- These four have RLS enabled with ZERO policies — deny-by-default, correct and intentional:
-- webhook/internal bookkeeping written by the service role only. Verified anon reads returned
-- [] and nothing in src/ references them (the single grep hit was a code comment).
--
-- But they still carried SELECT/INSERT/UPDATE/DELETE grants to anon and authenticated, so RLS
-- was the ONLY thing between the public and their contents — and square_pending_orders.order_data
-- holds customer name, email, phone, shipping address and artwork URLs. One carelessly-added
-- permissive policy and those grants become live access with nothing behind them.
--
-- Now locked at both layers, matching customer_privacy_optouts and review_invitations.
REVOKE ALL ON public.square_pending_orders     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.square_processed_payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.square_webhook_events     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ai_generation_blocklist   FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.square_pending_orders     TO service_role;
GRANT ALL ON public.square_processed_payments TO service_role;
GRANT ALL ON public.square_webhook_events     TO service_role;
GRANT ALL ON public.ai_generation_blocklist   TO service_role;
