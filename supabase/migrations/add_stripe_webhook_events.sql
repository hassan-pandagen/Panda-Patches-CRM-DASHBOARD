-- Stripe webhook idempotency table.
-- Stripe retries webhooks aggressively (up to 3 days). Without dedup on event.id,
-- a single checkout.session.completed could be processed multiple times and double-add
-- payment to orders.amount_paid.
--
-- Unique constraint on event_id makes the insert fail (23505) on retry, so the webhook
-- handler ACKs and skips processing.

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id    TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: only service role writes here (webhook function uses SERVICE_KEY).
-- No SELECT/INSERT/UPDATE/DELETE for authenticated/anon — this is internal infra.
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Cleanup policy: keep last 30 days of events (Stripe's retry window is 3 days,
-- 30 gives us a buffer for debugging duplicate-event reports).
-- This index makes the cleanup cheap.
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_received_at
  ON stripe_webhook_events (received_at);

NOTIFY pgrst, 'reload schema';
