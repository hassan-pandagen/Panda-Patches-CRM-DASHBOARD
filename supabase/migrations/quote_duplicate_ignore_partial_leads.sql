-- A partial lead is not a duplicate enquiry — it is the same person's own keystrokes.
-- Applied to production as migration `quote_duplicate_ignore_partial_leads` (9 Sept 2026).
--
-- set_quote_is_duplicate() flags a quote when the same email appears on another quote inside
-- 48 hours. That predates the website's partial-lead capture, which now writes a row the
-- moment someone types their email into the hero form. So the ordinary happy path — type
-- email, fill the form, submit two minutes later — produces a partial row followed by the
-- real quote, and the REAL one gets flagged as a duplicate of the customer's own abandoned
-- keystrokes.
--
-- Found via QT-11662 (steve@epopstudio.com): flagged duplicate because his own partial
-- QT-11661 arrived two minutes earlier. Systematic — 333 of 739 genuine quotes since the
-- partial capture launched carried the flag; 202 of those had no cause but their own partial.
--
-- The flag is NOT read anywhere in the CRM UI, so no agent was ever misled by it, but it
-- feeds lead-source / duplicate-rate reporting, which has been overstating duplicates.
--
-- Fix: ignore partial rows when deciding. A real repeat enquiry from the same person still
-- flags, which is the case the flag exists for.
CREATE OR REPLACE FUNCTION public.set_quote_is_duplicate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.customer_email IS NOT NULL AND btrim(NEW.customer_email) <> '' THEN
    NEW.is_duplicate := EXISTS (
      SELECT 1 FROM quotes
       WHERE lower(btrim(customer_email)) = lower(btrim(NEW.customer_email))
         AND created_at > now() - interval '48 hours'
         AND id IS DISTINCT FROM NEW.id
         -- Partial leads are the same person's abandoned form, not a second enquiry.
         AND coalesce(lead_source, '') NOT LIKE '%PARTIAL%'
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill only the rows flagged SOLELY because of a partial: every other quote on that email
-- inside the window must itself be a partial. A genuine repeat enquiry keeps its flag.
-- Cleared 202; 131 of the 739 remain flagged, which are real repeats.
UPDATE quotes q
SET is_duplicate = false
WHERE q.is_duplicate
  AND coalesce(q.lead_source,'') NOT LIKE '%PARTIAL%'
  AND q.customer_email IS NOT NULL AND btrim(q.customer_email) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM quotes o
     WHERE lower(btrim(o.customer_email)) = lower(btrim(q.customer_email))
       AND o.id IS DISTINCT FROM q.id
       AND o.created_at BETWEEN q.created_at - interval '48 hours' AND q.created_at
       AND coalesce(o.lead_source,'') NOT LIKE '%PARTIAL%'
  );
