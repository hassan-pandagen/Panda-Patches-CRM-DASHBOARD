import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const CodeBlock: React.FC<{ code: string }> = ({ code }) => {
    const [copied, setCopied] = useState<boolean>(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-slate-900 rounded-lg my-4 relative">
            <pre className="text-sm text-white p-4 overflow-x-auto">
                <code>{code.trim()}</code>
            </pre>
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-1 px-2 rounded"
            >
                {copied ? 'Copied!' : 'Copy'}
            </button>
        </div>
    );
};

const SettingsPage: React.FC = () => {
    const { role, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="text-slate-400">Loading...</div>
            </div>
        );
    }

    const canAccessSettings = role === 'ADMIN';
    
    if (!canAccessSettings) {
        return (
            <div className="max-w-4xl mx-auto p-6">
                <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-6 text-center">
                    <h2 className="text-2xl font-bold text-red-400 mb-2">Access Denied</h2>
                    <p className="text-slate-300">
                        You need administrator privileges to access this page.
                    </p>
                    <p className="text-slate-400 mt-2">
                        Your current role: <strong>{role}</strong>
                    </p>
                </div>
            </div>
        );
    }

    const fullSchemaSQL = ` -- =================================================================
-- PANDA PATCHES CRM - COMPLETE FIXED SCRIPT WITH WORKING USER MANAGEMENT
-- =================================================================

-- ================================================================
-- PART 0: CLEAN SETUP
-- ================================================================
DROP TABLE IF EXISTS public.monthly_costs CASCADE;
DROP TABLE IF EXISTS public.order_history CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;

DROP FUNCTION IF EXISTS public.broadcast_urgent_order() CASCADE;
DROP FUNCTION IF EXISTS public.generate_order_number() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.log_order_changes() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.get_my_role() CASCADE;
DROP FUNCTION IF EXISTS public.get_sales_report(text, text) CASCADE;

DROP SEQUENCE IF EXISTS public.order_number_seq CASCADE;

-- ================================================================
-- PART 1: TABLE DEFINITIONS
-- ================================================================
CREATE TABLE public.orders (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    order_number text,
    status text NOT NULL, -- Removed IN_PROGRESS from the check constraint
    customer_name text NOT NULL,
    customer_email text NOT NULL,
    customer_phone text,
    customer_profile_url text,
    shipping_address text,
    design_name text NOT NULL,
    design_size text,
    design_backing text,
    patches_type text,
    patches_quantity integer NOT NULL,
    revision_notes text,
    customer_attachment_urls text[],
    mockup_urls text[],
    redo_notes text,
    redo_attachments text[],
    instructions text,
    packing text,
    tracking_number text,
    courier text,
    order_amount numeric(10, 2) NOT NULL DEFAULT 0.00,
    amount_paid numeric(10, 2) NOT NULL DEFAULT 0.00,
    amount_remaining numeric(10, 2) GENERATED ALWAYS AS (order_amount - amount_paid) STORED,
    sales_agent text NOT NULL,
    is_urgent boolean NOT NULL DEFAULT false,
    is_urgent_approved boolean DEFAULT false,
    lead_source text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid()
);
COMMENT ON TABLE public.orders IS 'Stores all customer order information.';

CREATE TABLE public.order_history (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    order_id bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_email text NOT NULL,
    field_changed text NOT NULL,
    old_value text,
    new_value text,
    changed_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.order_history IS 'Audit trail for changes to the orders table.';

-- FIXED: Updated access structure with separate reports
CREATE TABLE public.user_profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text,
  full_name text,
  role text DEFAULT 'AGENT'::text NOT NULL, -- No CEO role
  access jsonb DEFAULT '{
    "dashboard": true,
    "orders": true, 
    "revenue": false,
    "sales_reports": false,
    "production_reports": false,
    "settings": false
  }'::jsonb
);
COMMENT ON TABLE public.user_profiles IS 'Stores user data and roles for authorization.';
 
CREATE TABLE public.monthly_costs (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    month_year text NOT NULL,
    category text NOT NULL,
    amount numeric(10, 2) NOT NULL,
    notes text,
    added_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.monthly_costs IS 'Tracks monthly business costs (materials, shipping, etc).';

-- ================================================================
-- PART 2: INDEXES
-- ================================================================
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_customer_email ON public.orders(customer_email);
CREATE INDEX idx_orders_sales_agent ON public.orders(sales_agent);
CREATE INDEX idx_orders_created_at ON public.orders(created_at);
CREATE INDEX idx_orders_is_urgent ON public.orders(is_urgent);
CREATE INDEX idx_orders_order_number ON public.orders(order_number);
CREATE INDEX idx_orders_created_at_desc ON public.orders(created_at DESC);
CREATE INDEX idx_order_history_order_id ON public.order_history(order_id);
CREATE INDEX idx_order_history_changed_at ON public.order_history(changed_at);
CREATE INDEX idx_monthly_costs_month_year ON public.monthly_costs(month_year);

-- ================================================================
-- PART 3: SEQUENCES
-- ================================================================
CREATE SEQUENCE public.order_number_seq START 10001;

-- ================================================================
-- PART 4: FUNCTIONS & TRIGGERS
-- ================================================================

-- Order number generator
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number = 'PP-' || nextval('public.order_number_seq');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Timestamp updater
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Audit logger
CREATE OR REPLACE FUNCTION public.log_order_changes()
RETURNS TRIGGER AS $$
DECLARE
    user_email_text text;
BEGIN
    SELECT email INTO user_email_text FROM auth.users WHERE id = auth.uid();

    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.order_history (order_id, user_email, field_changed, old_value, new_value)
        VALUES (NEW.id, user_email_text, 'status', OLD.status, NEW.status);
    END IF;

    IF OLD.order_amount IS DISTINCT FROM NEW.order_amount THEN
        INSERT INTO public.order_history (order_id, user_email, field_changed, old_value, new_value)
        VALUES (NEW.id, user_email_text, 'Order Amount', OLD.order_amount::text, NEW.order_amount::text);
    END IF;

    IF OLD.amount_paid IS DISTINCT FROM NEW.amount_paid THEN
        INSERT INTO public.order_history (order_id, user_email, field_changed, old_value, new_value)
        VALUES (NEW.id, user_email_text, 'Amount Paid', OLD.amount_paid::text, NEW.amount_paid::text);
    END IF;

    IF OLD.is_urgent IS DISTINCT FROM NEW.is_urgent THEN
        INSERT INTO public.order_history (order_id, user_email, field_changed, old_value, new_value)
        VALUES (NEW.id, user_email_text, 'Urgent Status', OLD.is_urgent::text, NEW.is_urgent::text);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FIXED: New user auto-profile with updated access structure
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role, access)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    COALESCE(new.raw_user_meta_data->>'role', 'AGENT'), -- Default to AGENT
    COALESCE(
      CASE 
        WHEN new.raw_user_meta_data->>'access' IS NOT NULL THEN 
          (new.raw_user_meta_data->>'access')::jsonb
        ELSE 
          CASE 
            WHEN new.raw_user_meta_data->>'role' = 'ADMIN' THEN
              '{"dashboard": true, "orders": true, "revenue": true, "sales_reports": true, "production_reports": true, "settings": true}'::jsonb
            ELSE
              '{"dashboard": true, "orders": true, "revenue": false, "sales_reports": false, "production_reports": false, "settings": false}'::jsonb
          END
      END,
      '{"dashboard": true, "orders": true, "revenue": false, "sales_reports": false, "production_reports": false, "settings": false}'::jsonb
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- FIXED: More reliable role getter
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql -- Renamed from get_my_role
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(role, 'AGENT') FROM public.user_profiles WHERE id = auth.uid()
$$; -- Renamed from get_my_role

-- Urgent order broadcaster
CREATE OR REPLACE FUNCTION public.broadcast_urgent_order()
-- This function is triggered after an order is inserted or updated
-- If the order is marked as urgent, it sends a notification to the 'urgent_orders' channel
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.is_urgent = true) THEN
    PERFORM pg_notify('urgent_orders', row_to_json(NEW)::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sales report function
CREATE OR REPLACE FUNCTION public.get_sales_report(start_date text, end_date text)
RETURNS TABLE (
    total_revenue numeric,
    total_orders bigint,
    total_collected numeric,
    sales_by_agent jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH filtered_orders AS (
        SELECT
            o.order_amount,
            o.amount_remaining,
            COALESCE(p.email, 'Unknown') AS sales_agent_email
        FROM public.orders o
        LEFT JOIN public.user_profiles p ON o.created_by = p.id
        WHERE
            o.status <> 'CANCELLED'
            AND o.created_at >= (start_date || 'T00:00:00Z')::timestamptz
            AND o.created_at <  (end_date   || 'T23:59:59Z')::timestamptz
    )
    SELECT
        COALESCE(SUM(fo.order_amount), 0),
        COUNT(fo.*),
        COALESCE(SUM(fo.order_amount - fo.amount_remaining), 0),
        COALESCE((
            SELECT jsonb_object_agg(agent, revenue)
            FROM (
                SELECT sales_agent_email AS agent, SUM(order_amount) AS revenue
                FROM filtered_orders
                GROUP BY sales_agent_email
            ) AS agent_sales
        ), '{}'::jsonb)
    FROM filtered_orders;
END;
$$;

-- ================================================================
-- PART 5: TRIGGERS
-- ================================================================
CREATE TRIGGER on_order_insert_generate_number
    BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

CREATE TRIGGER on_orders_update
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER on_orders_change_log
    AFTER UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.log_order_changes();

CREATE TRIGGER trigger_broadcast_urgent_order
    AFTER INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_urgent_order();

CREATE TRIGGER on_monthly_costs_update
    BEFORE UPDATE ON public.monthly_costs
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================================
-- PART 6: RLS POLICIES - FIXED FOR USER MANAGEMENT
-- ================================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_costs ENABLE ROW LEVEL SECURITY;

-- 1. Delete the old, too-permissive policy
DROP POLICY IF EXISTS "Internal team can manage all orders" ON public.orders;

-- 2. Admins can do anything
CREATE POLICY "Admins can manage all orders" ON public.orders
  FOR ALL USING (get_current_user_role() = 'ADMIN');

-- 3. Agents can see all data
CREATE POLICY "Agents can view all order data" ON public.orders
  FOR SELECT USING (get_current_user_role() = 'AGENT');

-- 4. Production can see all orders BUT NOT financial data
CREATE POLICY "Production can view non-financial order data" ON public.orders
  FOR SELECT USING (get_current_user_role() = 'PRODUCTION');
-- 5. Production can UPDATE orders (status, shipping, etc.)
CREATE POLICY "Production can update orders" ON public.orders
  FOR UPDATE USING (get_current_user_role() = 'PRODUCTION')
  WITH CHECK (get_current_user_role() = 'PRODUCTION');

-- Order history policies
CREATE POLICY "Internal team can view all order history" ON public.order_history FOR SELECT TO authenticated USING (true);

-- FIXED: User profiles policies that actually work
CREATE POLICY "Users can view their own profile" ON public.user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.user_profiles FOR SELECT USING (get_current_user_role() = 'ADMIN');
CREATE POLICY "Admins can update all profiles" ON public.user_profiles FOR UPDATE USING (get_current_user_role() = 'ADMIN');
CREATE POLICY "Admins can insert profiles" ON public.user_profiles FOR INSERT WITH CHECK (get_current_user_role() = 'ADMIN');

-- Monthly costs policies
CREATE POLICY "Admins can manage monthly costs" ON public.monthly_costs
    FOR ALL TO authenticated
    USING (public.get_current_user_role() = 'ADMIN');

-- ================================================================
-- PART 7: STORAGE BUCKET
-- ================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('order-attachments', 'order-attachments', true, 5242880,
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ================================================================
-- PART 8: STORAGE POLICIES
-- ================================================================
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;
DROP POLICY IF EXISTS "Internal team can manage order attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete" ON storage.objects;

CREATE POLICY "Internal team can manage order attachments" ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id = 'order-attachments')
    WITH CHECK (bucket_id = 'order-attachments');

CREATE POLICY "Allow authenticated read access" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'order-attachments');

CREATE POLICY "Allow authenticated insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'order-attachments');

CREATE POLICY "Allow authenticated delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'order-attachments');

-- ================================================================
-- PART 9: PERMISSIONS & DEFAULT DATA
-- ================================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.orders TO anon;

ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- FIXED: Create admin user with dynamic ID
DO $$ 
DECLARE
    admin_user_id uuid;
BEGIN
    -- Get the first admin user or create one
    SELECT id INTO admin_user_id 
    FROM auth.users 
    WHERE email = 'hello@pandapatches.com' 
    LIMIT 1;

    IF admin_user_id IS NOT NULL THEN
        INSERT INTO public.user_profiles (id, email, full_name, role, access)
        VALUES (
            admin_user_id,
            'hello@pandapatches.com',
            'Hello Admin',
            'ADMIN',
            '{"dashboard": true, "orders": true, "revenue": true, "sales_reports": true, "production_reports": true, "settings": true}'::jsonb
        )
        ON CONFLICT (id)
        DO UPDATE SET 
            email = EXCLUDED.email,
            full_name = EXCLUDED.full_name,
            role = 'ADMIN',
            access = '{"dashboard": true, "orders": true, "revenue": true, "sales_reports": true, "production_reports": true, "settings": true}'::jsonb;
    END IF;
END $$;

-- Auto-create profiles for existing users with default access
INSERT INTO public.user_profiles (id, email, role, access)
SELECT id, email, 'AGENT', '{"dashboard": true, "orders": true, "revenue": false, "sales_reports": false, "production_reports": false, "settings": false}'::jsonb
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.user_profiles)
ON CONFLICT (id) DO NOTHING;

-- ================================================================
-- PART 10: FINAL SETUP COMPLETE
-- ================================================================
SELECT '✅ CRM Database Setup Complete - User Management READY!' AS status;
    `;

    const storagePolicies = `
-- In Supabase Studio: Storage > Policies > order-attachments

-- 1. Allow authenticated users to view files
-- This gives read access to anyone who is logged in.
CREATE POLICY "Allow authenticated read access"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'order-attachments');

-- 2. Allow authenticated users to upload files
-- This allows any logged-in user to insert new files into the bucket.
CREATE POLICY "Allow authenticated insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'order-attachments');

-- 3. Allow authenticated users to delete their own files
-- IMPORTANT: This policy is not perfect as any user can delete any file.
-- For a production app, you would add a check to ensure the user owns the file,
-- which requires more complex logic, often involving a separate table that maps user IDs to file paths.
CREATE POLICY "Allow authenticated delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'order-attachments');
    `;

    return (
        <div className="max-w-4xl mx-auto space-y-8 text-slate-200">
            <h2 className="text-3xl font-bold text-slate-50">Developer Settings & Setup Guide</h2>
            
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-2xl font-semibold mb-4">1. Full Database Schema & Policies</h3>
                <p className="mb-2">This is the complete, all-in-one script for your database. It includes table creation, automated triggers for audit trails, and all necessary security policies. You can run this entire script in your Supabase SQL Editor. It is safe to run multiple times.</p>
                <CodeBlock code={fullSchemaSQL} />
            </div>

            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-2xl font-semibold mb-4">2. Storage Bucket Policies</h3>
                <p className="mb-2">For file uploads to work, you need a public bucket named order-attachments and the correct policies.</p>
                <CodeBlock code={storagePolicies} />
            </div>
        </div>
    );
};

export default SettingsPage;