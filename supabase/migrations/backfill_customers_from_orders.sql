-- Idempotent backfill for the `customers` master table: one row per distinct normalized
-- order email, seeded from that email's most recent order, linked to customer_profiles by
-- normalized-email match where one exists.
--
-- Excludes 2 emails confirmed via audit to be staff sales-agent addresses accidentally used
-- as customer_email on orders (not real single customers — each represents multiple unrelated
-- real people): danishpandapatches@gmail.com (18 orders / 9+ distinct people),
-- furqanali91400@gmail.com (1 order). Both equal orders.sales_agent on every affected row.
INSERT INTO customers (email, full_name, phone, default_shipping_address, country, customer_profile_id, created_by)
SELECT DISTINCT ON (lower(trim(o.customer_email)))
    trim(o.customer_email),
    trim(o.customer_name),
    o.customer_phone,
    o.shipping_address,
    o.country,
    cp.id,
    'system_backfill'
FROM orders o
LEFT JOIN customer_profiles cp ON lower(trim(cp.email)) = lower(trim(o.customer_email))
WHERE o.customer_email IS NOT NULL AND o.customer_email <> ''
  AND lower(trim(o.customer_email)) NOT IN ('danishpandapatches@gmail.com', 'furqanali91400@gmail.com')
ORDER BY lower(trim(o.customer_email)), o.created_at DESC
ON CONFLICT (normalized_email) WHERE is_active = true DO NOTHING;
