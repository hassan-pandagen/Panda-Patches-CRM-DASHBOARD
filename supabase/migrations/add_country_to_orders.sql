-- Add country column to orders for marketing/region reporting.
-- Locked to 5 supported shipping countries via CHECK constraint.
-- Existing rows are NULL (CHECK allows NULL).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS country text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_country_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_country_check
  CHECK (country IS NULL OR country IN ('USA', 'AUSTRALIA', 'CANADA', 'NEW ZEALAND', 'UK'));

CREATE INDEX IF NOT EXISTS idx_orders_country
  ON public.orders (country)
  WHERE country IS NOT NULL;

COMMENT ON COLUMN public.orders.country IS
  'Shipping country (sales agent picks from a fixed dropdown). Locked to USA / AUSTRALIA / CANADA / NEW ZEALAND / UK. Add new countries by extending the CHECK constraint and the COUNTRY_OPTIONS constant in src/constants/options.ts.';
