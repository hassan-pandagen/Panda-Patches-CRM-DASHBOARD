-- CL0FAA §2: auto-emailed PAID invoice on full Square payment.
-- Same one-time-send guard pattern as customer_confirmation_sent_at / production_notified_at:
-- an atomic `UPDATE ... WHERE paid_invoice_sent_at IS NULL RETURNING id` claims the send exactly
-- once, safe across Square webhook retries.
alter table public.orders
  add column if not exists paid_invoice_sent_at timestamptz;
