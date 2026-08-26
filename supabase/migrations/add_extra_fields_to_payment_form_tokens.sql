-- Payment Form / Order Form parity: the payment-form flow creates a genuine order (Flow A in
-- square-payment-webhook) but historically captured a narrower field set than the full staff
-- Order Form. Adds the fields agreed as real gaps: CC Email + Urgent/Ship-By (agent-only,
-- staff judgment calls, never shown to the customer) and Purchase Order/Organization/Border
-- Type/Sample Box/Country (agent can prefill, customer fills if left blank — same pattern as
-- the existing design_name/patches_type columns).
alter table public.payment_form_tokens
  add column if not exists cc_email text,
  add column if not exists purchase_order text,
  add column if not exists organization text,
  add column if not exists border_type text,
  add column if not exists sample_box boolean not null default false,
  add column if not exists country text,
  add column if not exists is_urgent boolean not null default false,
  add column if not exists rush_date date;
