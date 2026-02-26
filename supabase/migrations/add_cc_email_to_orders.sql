-- Add CC email field to orders table
-- Allows sending order emails to a secondary contact (e.g. company with 2 recipients)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cc_email TEXT;

-- Optional: index for searching by cc_email
CREATE INDEX IF NOT EXISTS idx_orders_cc_email ON orders (cc_email) WHERE cc_email IS NOT NULL;
