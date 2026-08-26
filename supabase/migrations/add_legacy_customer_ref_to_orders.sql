-- CL0FAA §3: "ONE order number everywhere". The internal PP-xxxxx order_number is the single
-- canonical identifier; legacy_customer_ref preserves whatever number the customer portal /
-- old emails showed a customer BEFORE that migration, so an agent can still find an order when
-- a customer quotes an old number. Populated by a one-time backfill from the website side
-- (they know the old numbering scheme) — this repo only needs the column + search coverage.
alter table public.orders
  add column if not exists legacy_customer_ref text;

create index if not exists idx_orders_legacy_customer_ref
  on public.orders (legacy_customer_ref);
