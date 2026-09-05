-- ============================================================================
-- Chenille thread colour chart — 140 codes, applied 2026-09-06.
-- Source: CHENIL_1.CSV (repo root), the supplier chart the floor actually works from.
--
-- Reference side of the field Task 3.2 asks for ("thread colours do not exist —
-- one new field required").
--
-- ⚠️ hex_approx IS APPROXIMATE, and named so deliberately. It was sampled from a chart
-- image, not supplied by the manufacturer. A picking aid in the UI — never the
-- specification, never what production matches against, never shown to a customer as
-- "your colour". `code` is the only authoritative value in this table.
--
-- `name` is NULL for all 140: the chart carries codes and swatches only.
--
-- ── How this was loaded, and why it is checksummed ─────────────────────────
-- The first load was hand-written from the chart image rather than copied from the CSV,
-- and 110 of 140 hex values came out wrong — plausible-looking, so only the ONE malformed
-- value tripped the CHECK constraint. The other 109 loaded silently.
--
-- Corrected by generating the UPDATE from the CSV, then verifying with an md5 over
-- code|hex|column|row computed on both sides:
--     CSV  3dae15cd86dd6fd3dda8605820bddb21
--     DB   3dae15cd86dd6fd3dda8605820bddb21
-- Re-run that comparison after any reload. A constraint catches malformed data; only a
-- checksum catches data that is well-formed and wrong.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.thread_colours (
  code          text PRIMARY KEY,
  name          text,
  hex_approx    text,
  chart_column  integer,
  chart_row     integer,
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT thread_colours_code_format CHECK (code ~ '^[0-9]{4,6}$'),
  CONSTRAINT thread_colours_hex_format  CHECK (hex_approx IS NULL OR hex_approx ~* '^#[0-9a-f]{6}$')
);

ALTER TABLE public.thread_colours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS thread_colours_read ON public.thread_colours;
CREATE POLICY thread_colours_read ON public.thread_colours
  FOR SELECT TO authenticated USING (true);
REVOKE ALL    ON public.thread_colours FROM anon;
GRANT  SELECT ON public.thread_colours TO authenticated;
GRANT  ALL    ON public.thread_colours TO service_role;

-- Row data is loaded from CHENIL_1.CSV; see the checksum note above.
