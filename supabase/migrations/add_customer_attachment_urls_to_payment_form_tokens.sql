-- Payment Form image uploads were being stored as mockup_urls (internal design-team proofs),
-- but they're actually customer-supplied reference images (same semantic as orders.customer_
-- attachment_urls elsewhere in the app) — add the correct column so PaymentFormPage.tsx can
-- stop misusing mockup_urls for this.
alter table public.payment_form_tokens
  add column if not exists customer_attachment_urls text[] not null default '{}';
