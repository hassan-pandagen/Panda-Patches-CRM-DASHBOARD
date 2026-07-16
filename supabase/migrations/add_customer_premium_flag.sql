-- "Premium customer" tagging (CEO request): lets sales/admin mark a customer so production
-- knows to apply extra QA/QC. Keyed by email (not customer_profiles) so it works for every
-- customer regardless of whether they ever created a portal account — matches the existing
-- "Repeat Order" badge convention (AllOrdersPage), which also identifies customers by email.
CREATE TABLE IF NOT EXISTS customer_flags (
    customer_email text PRIMARY KEY,  -- always stored lower(trim(...)) by the app layer
    is_premium boolean NOT NULL DEFAULT false,
    set_by text,
    set_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_flags ENABLE ROW LEVEL SECURITY;

-- Staff-only (same idiom as "Staff read all customer profiles" in 004_customer_portal.sql).
-- Customers also authenticate via Supabase Auth, so this must NOT be a blanket
-- `TO authenticated USING (true)` policy — that would let a logged-in customer read every
-- other customer's premium flag. Scoping to a user_profiles row keeps this staff-only.
CREATE POLICY "Staff full access to customer_flags" ON customer_flags
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid()));
