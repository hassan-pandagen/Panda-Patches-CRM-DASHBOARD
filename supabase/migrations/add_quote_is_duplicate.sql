-- ============================================================================
-- QUOTE DUPLICATE FLAG  (CLADB5 Task 3)
-- Mark a quote is_duplicate when the SAME normalized email submitted another quote
-- within the prior 48h (rapid re-submissions — ~30% of volume). Read-only feature:
-- one additive flag column + a backfill + a BEFORE-INSERT trigger. No change to quote
-- ingestion/capture, tracking, or GTM. "Traffic normalization" needs no stored column —
-- detectLeadSource() is the canonical resolver, applied at read time.
--
-- Email normalization = lower(btrim(email)) — the SAME as the Google Ads export, so the
-- report's "unique leads" and duplicate collapsing match ad-platform matching.
-- ============================================================================

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS is_duplicate boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.quotes.is_duplicate IS
  'True when the same normalized email submitted an earlier quote within 48h (CLADB5). Set by trg_quote_is_duplicate; the quotes list collapses these, the report counts unique leads.';

-- Backfill: flag any quote whose immediately-preceding same-email quote was < 48h before it.
WITH ranked AS (
  SELECT id,
         created_at,
         lag(created_at) OVER (
           PARTITION BY lower(btrim(customer_email))
           ORDER BY created_at
         ) AS prev_at
    FROM public.quotes
   WHERE customer_email IS NOT NULL AND btrim(customer_email) <> ''
)
UPDATE public.quotes q
   SET is_duplicate = true
  FROM ranked r
 WHERE q.id = r.id
   AND r.prev_at IS NOT NULL
   AND r.created_at - r.prev_at < interval '48 hours';

-- Going forward: stamp is_duplicate at insert if an earlier same-email quote exists in 48h.
CREATE OR REPLACE FUNCTION public.set_quote_is_duplicate()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.customer_email IS NOT NULL AND btrim(NEW.customer_email) <> '' THEN
    NEW.is_duplicate := EXISTS (
      SELECT 1 FROM quotes
       WHERE lower(btrim(customer_email)) = lower(btrim(NEW.customer_email))
         AND created_at > now() - interval '48 hours'
         AND id IS DISTINCT FROM NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_is_duplicate ON public.quotes;
CREATE TRIGGER trg_quote_is_duplicate
  BEFORE INSERT ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_quote_is_duplicate();

CREATE INDEX IF NOT EXISTS idx_quotes_email_created
  ON public.quotes (lower(btrim(customer_email)), created_at);
