-- Customer Accounts: one master record per real person (portal login or guest checkout),
-- independent of auth.users so guest-checkout customers (442/713 distinct order emails
-- with no customer_profiles row, at time of writing) can have an account too.
-- customer_profiles (portal login identity) is linked here by normalized email, not the
-- other way around. See claude-code-task-customer-accounts.md / the Customer Accounts plan.

CREATE TABLE IF NOT EXISTS customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    email text NOT NULL,                          -- display form, as typed/observed
    normalized_email text GENERATED ALWAYS AS (lower(trim(email))) STORED,

    full_name text,
    phone text,
    default_shipping_address text,
    country text,
    company_name text,                             -- free text; no real companies entity exists yet
    notes text,

    customer_profile_id uuid REFERENCES customer_profiles(id) ON DELETE SET NULL,

    merged_into_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    is_active boolean NOT NULL DEFAULT true,        -- false once merged away (never deleted)

    created_by text,                                -- staff email, or 'system_backfill'
    updated_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- One active account per normalized email; a merged-away (is_active=false) duplicate
-- doesn't block the survivor from keeping that email.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_normalized_email_active
    ON customers (normalized_email) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_customers_normalized_email ON customers (normalized_email);
CREATE INDEX IF NOT EXISTS idx_customers_merged_into ON customers (merged_into_id) WHERE merged_into_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_profile_id ON customers (customer_profile_id) WHERE customer_profile_id IS NOT NULL;

CREATE OR REPLACE FUNCTION set_customers_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Staff-only (internal master record) — no customer-self policy, unlike customer_profiles.
CREATE POLICY "Staff full access to customers" ON customers
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid()));
