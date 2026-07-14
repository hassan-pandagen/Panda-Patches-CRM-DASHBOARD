-- Quotes can now carry a shipping address (edited on the Edit Quote form). It also flows
-- into the order when a quote is converted, so the address isn't re-entered.
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS shipping_address text;
