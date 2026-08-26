-- CL0FAA §3 follow-up (flagged by the website dev): orders.order_number had no index despite
-- being unique/never-null across all rows and now being the customer portal's own lookup
-- predicate (order-detail page filters on it directly). Fine at ~1,125 rows, a sequential scan
-- as it grows. UNIQUE (not just a plain index) turns "duplicate order number" from merely
-- unlikely (the generate_order_number() trigger/sequence already guarantees it in the normal
-- path) into structurally impossible — only a manual write could ever violate it, and that
-- should fail loudly rather than silently corrupt data.
-- No CONCURRENTLY: table is small enough (~1,125 rows) that a plain index build is instant,
-- and CONCURRENTLY can't run inside the transaction this migration executes in anyway.
create unique index if not exists idx_orders_order_number
  on public.orders (order_number);
