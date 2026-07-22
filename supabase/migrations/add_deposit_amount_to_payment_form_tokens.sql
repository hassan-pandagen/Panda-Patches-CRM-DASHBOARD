-- Applied 2026-07-21 via Supabase MCP (remote version: add_deposit_amount_to_payment_form_tokens)
-- Deposit/partial payment forms previously stored only ONE amount (order_amount), so a
-- deposit charge was recorded as the whole order total: the created order showed
-- Total = deposit, Remaining = 0 (agents fixed it by hand every time). Split the two:
--   order_amount   = the full order TOTAL (unchanged meaning: what the order is worth)
--   deposit_amount = the amount to charge NOW, set only when is_deposit = true (else NULL)
-- The customer is charged deposit_amount; the order is created with order_amount as the
-- total, so Total / Paid / Remaining come out right with no manual edit.
ALTER TABLE public.payment_form_tokens
  ADD COLUMN deposit_amount numeric;

COMMENT ON COLUMN public.payment_form_tokens.deposit_amount IS
  'Amount to charge now when is_deposit = true (partial payment). NULL for full payments. order_amount always holds the full order total.';
