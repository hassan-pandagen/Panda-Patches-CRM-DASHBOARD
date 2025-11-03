import React, { useState } from 'react';

const CodeBlock: React.FC<{ code: string }> = ({ code }) => {
    const [copied, setCopied] = useState(false);

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
    const fullSchemaSQL = ` -- =================================================================
--  PANDA PATCHES CRM - MASTER SUPABASE SCRIPT
--  Version: 6.8 (Customer Profile + Monthly Costs + Sales Report)
--  Description:
--   Sets up all CRM tables, triggers, RLS policies, storage bucket,
--   monthly_costs tracking, and the new sales report function.
--   ✅ Safe to run multiple times.
-- =================================================================

-- ================================================================
-- PART 0: DESTRUCTIVE RESET
-- ================================================================
DROP TABLE IF EXISTS public.monthly_costs CASCADE;
DROP TABLE IF EXISTS public.order_history CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;

-- ================================================================
-- PART 1: TABLE DEFINITIONS
-- ================================================================

-- ORDERS TABLE
CREATE TABLE public.orders (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    order_number text,
    status text NOT NULL,
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
    is_urgent_approved boolean NOT NULL DEFAULT false,
    lead_source text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid()
);
COMMENT ON TABLE public.orders IS 'Stores all customer order information.';

-- ORDER HISTORY TABLE
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

-- USER PROFILES TABLE
CREATE TABLE public.user_profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text,
  role text DEFAULT 'AGENT'::text NOT NULL
);
COMMENT ON TABLE public.user_profiles IS 'Stores user data and roles for authorization.';

-- MONTHLY COSTS TABLE
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
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_sales_agent ON public.orders(sales_agent);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_is_urgent ON public.orders(is_urgent);
CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON public.order_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_history_changed_at ON public.order_history(changed_at);
CREATE INDEX IF NOT EXISTS idx_monthly_costs_month_year ON public.monthly_costs(month_year);

-- ================================================================
-- PART 3: FUNCTIONS & TRIGGERS
-- ================================================================

-- Sequence and trigger for generating short, sequential order numbers
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 10001;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number = 'PP-' || nextval('public.order_number_seq');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_order_insert_generate_number ON public.orders;
CREATE TRIGGER on_order_insert_generate_number
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

-- Timestamp update helper
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_orders_update ON public.orders;
CREATE TRIGGER on_orders_update
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_monthly_costs_update ON public.monthly_costs;
CREATE TRIGGER on_monthly_costs_update
BEFORE UPDATE ON public.monthly_costs
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Audit logging
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
    IF OLD.is_urgent_approved IS DISTINCT FROM NEW.is_urgent_approved THEN
        INSERT INTO public.order_history (order_id, user_email, field_changed, old_value, new_value)
        VALUES (NEW.id, user_email_text, 'Urgent Approval', OLD.is_urgent_approved::text, NEW.is_urgent_approved::text);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_orders_change_log ON public.orders;
CREATE TRIGGER on_orders_change_log
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_changes();

-- New user auto-profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role)
  VALUES (new.id, new.email, 'AGENT')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper: Get current user's role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;

-- ================================================================
-- ✅ NEW PART: SALES REPORT FUNCTION
-- ================================================================
-- Drop the function first to handle changes in return type
DROP FUNCTION IF EXISTS public.get_sales_report(text, text);

CREATE OR REPLACE FUNCTION public.get_sales_report(
    start_date text,
    end_date text
) 
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
            p.email AS sales_agent_email
        FROM
            public.orders o
        LEFT JOIN
            public.user_profiles p ON o.created_by = p.id
        WHERE
            o.status <> 'CANCELLED'
            AND o.created_at >= to_timestamp(start_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            AND o.created_at <= to_timestamp(end_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
    SELECT
        SUM(fo.order_amount) AS total_revenue,
        COUNT(*) AS total_orders,
        SUM(fo.order_amount - fo.amount_remaining) AS total_collected,
        (
            SELECT jsonb_object_agg(agent, revenue)
            FROM (
                SELECT
                    sales_agent_email AS agent,
                    SUM(order_amount) AS revenue
                FROM
                    filtered_orders
                GROUP BY
                    sales_agent_email
            ) AS agent_sales
        ) AS sales_by_agent
    FROM
        filtered_orders;
END;
$$;

-- ================================================================
-- PART 4: RLS POLICIES
-- ================================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_costs ENABLE ROW LEVEL SECURITY;

-- Remove old policies
DROP POLICY IF EXISTS "Internal team can manage all orders" ON public.orders;
DROP POLICY IF EXISTS "Internal team can view all order history" ON public.order_history;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update user profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Internal team can manage order attachments" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage monthly costs" ON public.monthly_costs;

-- Orders policies
CREATE POLICY "Internal team can manage all orders"
ON public.orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Internal team can view all order history"
ON public.order_history FOR SELECT TO authenticated USING (true);

-- User profiles
CREATE POLICY "Users can view their own profile" 
ON public.user_profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" 
ON public.user_profiles FOR SELECT USING (public.get_my_role() = 'ADMIN');

CREATE POLICY "Admins can update user profiles" 
ON public.user_profiles FOR UPDATE USING (public.get_my_role() = 'ADMIN')
WITH CHECK (public.get_my_role() = 'ADMIN');

-- Storage
CREATE POLICY "Internal team can manage order attachments"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'order-attachments')
WITH CHECK (bucket_id = 'order-attachments');

-- Monthly Costs
CREATE POLICY "Admins can manage monthly costs"
ON public.monthly_costs FOR ALL TO authenticated
USING (public.get_my_role() = 'ADMIN')
WITH CHECK (public.get_my_role() = 'ADMIN');

-- ================================================================
-- PART 5: STORAGE BUCKET
-- ================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('order-attachments', 'order-attachments', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ================================================================
-- PART 6: PERMISSIONS
-- ================================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.orders TO anon;

-- ================================================================
-- PART 7: BACKFILL EXISTING USERS
-- ================================================================
INSERT INTO public.user_profiles (id, email, role)
SELECT id, email, 'AGENT'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.user_profiles);
    `;

    const csvHeaders = `order_number,customer_name,customer_email,customer_phone,design_name,patches_type,patches_quantity,order_amount,amount_paid,status,created_at,sales_agent,lead_source,instructions`;
    const csvExample = `ORD-0001,John Doe,john@example.com,03121234567,Panda Patch,Woven,100,250.00,100.00,DELIVERED,2024-05-12T10:00:00Z,Ali,Facebook,"Repeat customer"`;
    const importInstructions = `
1. Go to the Supabase Dashboard → Table editor.
2. Select the 'orders' table.
3. Click 'Import data' → 'Import from CSV'.
4. Upload your CSV file.
5. Map the columns from your CSV to the corresponding columns in the 'orders' table.
6. Run the import.

Note:
- Supabase will accept ISO timestamp strings (e.g., 2024-05-12T10:00:00Z) for date fields like 'created_at'.
- The CSV should not include binary/image attachments. For attachments, upload them via the UI or bulk upload to storage and then reference the URLs.
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
                <p className="mb-2">For file uploads to work, you need a public bucket named `order-attachments` and the correct policies. Go to `Storage` {' > '} `Policies` in Supabase and create policies using the SQL below.</p>
                <CodeBlock code={storagePolicies} />
            </div>

            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-2xl font-semibold mb-4">3. CORS (Cross-Origin Resource Sharing)</h3>
                <p className="mb-2">If you see network errors when the app tries to connect to Supabase, you may need to adjust your CORS settings. Go to `Project Settings` {' > '} `API` {' > '} `CORS settings` in your Supabase dashboard.</p>
                <p>For development, it's common to add `http://localhost:3000` to your allowed origins. For production, you should add your application's public URL (e.g., `https://my-crm.vercel.app`).</p>
            </div>

            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-2xl font-semibold mb-4">4. Bulk Import via CSV</h3>
                <p className="mb-2">To bulk import existing orders, create a CSV file with the following headers. These match your existing `orders` table columns.</p>
                <h4 className="font-semibold mt-4">CSV Headers:</h4>
                <CodeBlock code={csvHeaders} />
                <h4 className="font-semibold mt-4">Example Row:</h4>
                <CodeBlock code={csvExample} />
                <h4 className="font-semibold mt-4">How to Import:</h4>
                <p className="whitespace-pre-wrap text-sm">{importInstructions}</p>
            </div>
        </div>
    );
};

export default SettingsPage;
