-- Add assignment tracking columns to orders table
-- Run this in Supabase SQL Editor

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS assigned_by TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

-- Add index for querying unassigned orders
CREATE INDEX IF NOT EXISTS idx_orders_sales_agent_null ON orders (sales_agent) WHERE sales_agent IS NULL;

-- Add index for assignment tracking
CREATE INDEX IF NOT EXISTS idx_orders_assigned_by ON orders (assigned_by);

COMMENT ON COLUMN orders.assigned_by IS 'Email of the admin who assigned this order';
COMMENT ON COLUMN orders.assigned_at IS 'Timestamp when the order was assigned';
