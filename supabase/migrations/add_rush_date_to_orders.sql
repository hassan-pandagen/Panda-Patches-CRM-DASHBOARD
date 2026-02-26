-- Add rush_date field to orders table
-- When an order is marked urgent, the agent sets the required shipping date
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS rush_date DATE;

-- Index for finding upcoming urgent orders
CREATE INDEX IF NOT EXISTS idx_orders_rush_date ON orders (rush_date) WHERE rush_date IS NOT NULL;
