-- ============================================================================
-- REVIEW-GENERATION PROGRAM (MASTER v3, item #1)
-- Compliance-first (Trustpilot + FTC 2024): ask every delivered customer ONCE,
-- one reminder max, no incentives, no review-gating.
--
-- This migration adds the data layer only. The actual sending is done by the
-- `review-invite-cron` edge function, scheduled by `schedule_review_invite_cron.sql`
-- (kept separate so cron/pg_net enablement is a deliberate final step).
-- ============================================================================

-- ── 1) orders.delivered_at ──────────────────────────────────────────────────
-- WHEN an order reached DELIVERED. We need this to fire the invite 2–3 days later.
-- Set by a DB trigger (below) so it is captured no matter which path flips the
-- status — the CRM UI, the Square webhook, or a tracking webhook — not just the
-- client. (order_communications is NOT a reliable source: delivered emails can be
-- silently missed, per the EmailLogsSection backstop.)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

COMMENT ON COLUMN public.orders.delivered_at IS
  'First time the order reached DELIVERED. Set once by trg_set_order_delivered_at; drives the review-invite cron. Never overwritten on later updates.';

-- Trigger: stamp delivered_at the first time status becomes DELIVERED.
-- Guard on delivered_at IS NULL so it is written once and never reset if the order
-- bounces out of and back into DELIVERED.
CREATE OR REPLACE FUNCTION public.set_order_delivered_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'DELIVERED' AND NEW.delivered_at IS NULL THEN
    NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_order_delivered_at ON public.orders;
CREATE TRIGGER trg_set_order_delivered_at
  BEFORE INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_delivered_at();

-- Backfill existing orders. Prefer the first SUCCESSFUL delivered-email timestamp;
-- fall back to updated_at for delivered/feedback orders that never logged one.
-- All historical dates are far outside the cron's recent window, so backfilling
-- does NOT trigger a mass send — only orders delivered in the last few days qualify.
UPDATE public.orders o
   SET delivered_at = sub.first_delivered
  FROM (
    SELECT order_id, MIN(sent_at) AS first_delivered
      FROM public.order_communications
     WHERE template_id = 'CUSTOMER_DELIVERED'
       AND COALESCE(subject, '') NOT LIKE 'FAILED:%'
     GROUP BY order_id
  ) sub
 WHERE o.id = sub.order_id
   AND o.delivered_at IS NULL;

UPDATE public.orders
   SET delivered_at = updated_at
 WHERE delivered_at IS NULL
   AND status IN ('DELIVERED', 'FEEDBACK');

-- Index for the cron's "delivered in the last few days, not yet invited" scan.
CREATE INDEX IF NOT EXISTS idx_orders_delivered_at
  ON public.orders (delivered_at)
  WHERE delivered_at IS NOT NULL;

-- ── 2) review_invitations ───────────────────────────────────────────────────
-- One row per order that has been asked. Enforces "once + one reminder max":
-- UNIQUE(order_id) blocks a second invite; reminder_sent_at gates the reminder.
CREATE TABLE IF NOT EXISTS public.review_invitations (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_email   text   NOT NULL,
  invite_sent_at   timestamptz NOT NULL DEFAULT now(),
  reminder_sent_at timestamptz,
  status           text   NOT NULL DEFAULT 'invited',  -- 'invited' | 'reminded'
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

COMMENT ON TABLE public.review_invitations IS
  'Review-ask ledger (MASTER v3). One row per order; UNIQUE(order_id) + reminder_sent_at enforce ask-once + one-reminder. Written only by the service role (review-invite-cron). Read via review_invitation_stats() — never granted to authenticated, since portal customers are also authenticated.';

CREATE INDEX IF NOT EXISTS idx_review_invitations_reminder_due
  ON public.review_invitations (invite_sent_at)
  WHERE reminder_sent_at IS NULL;

-- Lockdown (mirrors customer_privacy_optouts): service role only. Portal customers
-- authenticate as `authenticated`, so a blanket grant would leak the ledger to them.
ALTER TABLE public.review_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_invitations FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.review_invitations_id_seq FROM anon, authenticated;

-- ── 3) Reports metric (staff-gated) ─────────────────────────────────────────
-- Monthly invitations + reminders sent. SECURITY DEFINER so it can read the locked
-- table, but it hard-checks the caller is office staff (ADMIN/SALES_AGENT) first —
-- production, shipping, and portal customers get nothing.
-- NOTE: invitation→review RATE and rating trend need the Trustpilot API (the brief's
-- upgrade path) and are intentionally NOT synthesized from CRM data here.
CREATE OR REPLACE FUNCTION public.review_invitation_stats()
  RETURNS TABLE (month text, invites_sent bigint, reminders_sent bigint)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF get_user_role() NOT IN ('ADMIN', 'SALES_AGENT') THEN
    RAISE EXCEPTION 'Not authorized to view review metrics';
  END IF;

  RETURN QUERY
    SELECT to_char(date_trunc('month', invite_sent_at), 'YYYY-MM') AS month,
           count(*)                    AS invites_sent,
           count(reminder_sent_at)     AS reminders_sent
      FROM review_invitations
     GROUP BY 1
     ORDER BY 1 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.review_invitation_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.review_invitation_stats() TO authenticated;
