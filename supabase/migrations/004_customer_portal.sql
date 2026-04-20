-- ============================================
-- CUSTOMER PORTAL: Phase 1 Migration
-- ============================================

-- 1. Customer Profiles table (separate from internal user_profiles)
CREATE TABLE IF NOT EXISTS customer_profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text UNIQUE NOT NULL,
    full_name text,
    company_name text,
    phone text,
    avatar_url text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_email ON customer_profiles(email);

ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;

-- Customers can read/update their own profile
CREATE POLICY "Customers read own profile" ON customer_profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Customers update own profile" ON customer_profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Staff can read all customer profiles
CREATE POLICY "Staff read all customer profiles" ON customer_profiles
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid()));

-- 2. Customer Notifications table
CREATE TABLE IF NOT EXISTS customer_notifications (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    customer_email text NOT NULL,
    order_id bigint REFERENCES orders(id) ON DELETE CASCADE,
    type text NOT NULL, -- 'status_change', 'shipped', 'delivered', 'proof_ready'
    title text NOT NULL,
    body text NOT NULL,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_notif_email ON customer_notifications(customer_email);
CREATE INDEX IF NOT EXISTS idx_customer_notif_read ON customer_notifications(customer_email, is_read) WHERE is_read = false;

ALTER TABLE customer_notifications ENABLE ROW LEVEL SECURITY;

-- Customers can read/update their own notifications
CREATE POLICY "Customers read own notifications" ON customer_notifications
    FOR SELECT TO authenticated
    USING (
        customer_email = (SELECT email FROM customer_profiles WHERE id = auth.uid())
    );

CREATE POLICY "Customers mark own notifications read" ON customer_notifications
    FOR UPDATE TO authenticated
    USING (
        customer_email = (SELECT email FROM customer_profiles WHERE id = auth.uid())
    )
    WITH CHECK (
        customer_email = (SELECT email FROM customer_profiles WHERE id = auth.uid())
    );

-- Staff can manage all notifications
CREATE POLICY "Staff manage all notifications" ON customer_notifications
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid()));

-- 3. RLS on orders table (CRITICAL - must not break CRM)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Staff: full access (preserves existing CRM behavior)
CREATE POLICY "Staff full access to orders" ON orders
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid()));

-- Customers: read-only, own orders only (matched by email)
CREATE POLICY "Customers read own orders" ON orders
    FOR SELECT TO authenticated
    USING (
        customer_email = (SELECT email FROM customer_profiles WHERE id = auth.uid())
        OR cc_email = (SELECT email FROM customer_profiles WHERE id = auth.uid())
    );

-- 4. RLS on order_history (customers see only status changes on their orders)
ALTER TABLE order_history ENABLE ROW LEVEL SECURITY;

-- Staff full access
CREATE POLICY "Staff full access to order_history" ON order_history
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid()));

-- Customers: read status changes on their own orders only
CREATE POLICY "Customers read own order history" ON order_history
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM orders
            WHERE orders.id = order_history.order_id
            AND (
                orders.customer_email = (SELECT email FROM customer_profiles WHERE id = auth.uid())
                OR orders.cc_email = (SELECT email FROM customer_profiles WHERE id = auth.uid())
            )
        )
        AND field_changed IN ('status', 'ORDER_CREATED')
    );

-- 5. Auto-create customer profile on signup (only if NOT an internal user)
CREATE OR REPLACE FUNCTION handle_new_customer()
RETURNS trigger AS $$
BEGIN
    -- Only create customer profile if user is NOT an internal staff member
    IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = NEW.id) THEN
        INSERT INTO customer_profiles (id, email, full_name)
        VALUES (
            NEW.id,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
        )
        ON CONFLICT (id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to avoid duplicates
DROP TRIGGER IF EXISTS on_customer_signup ON auth.users;

CREATE TRIGGER on_customer_signup
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_customer();
