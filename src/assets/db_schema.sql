-- =================================================================
-- PANDA PATCHES CRM - FINAL MASTER SCHEMA (IDEMPOTENT FIX)
-- =================================================================

-- SECTION 1: CLEANUP
-- -----------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_check_production_updates ON public.orders;
DROP FUNCTION IF EXISTS public.check_production_updates() CASCADE;
DROP VIEW IF EXISTS public.orders_with_details;
DROP VIEW IF EXISTS public.sales_agent_reports;
DROP TABLE IF EXISTS public.order_history CASCADE;
DROP TABLE IF EXISTS public.order_communications CASCADE;
DROP TABLE IF EXISTS public.email_templates CASCADE;
DROP TABLE IF EXISTS public.monthly_costs CASCADE;

-- SECTION 2: TABLES
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  role text DEFAULT 'USER',
  permissions jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.orders (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    order_number text,
    customer_name text NOT NULL,
    customer_email text,
    customer_phone text,
    customer_profile_url text,
    shipping_address text,
    design_name text,
    instructions text,
    production_file_urls text[],
    shipping_attachment_urls text[],
    design_size text,
    design_backing text,
    patches_type text,
    patches_quantity integer DEFAULT 0,
    revision_notes text,
    customer_attachment_urls text[],
    mockup_urls text[],
    redo_notes text,
    redo_attachments text[],
    packing text,
    shipping_carrier text,
    shipping_tracking_number text,
    order_amount numeric(10,2) NOT NULL DEFAULT 0.00,
    amount_paid numeric(10,2) NOT NULL DEFAULT 0.00,
    production_cost numeric(10,2) NOT NULL DEFAULT 0.00,
    shipping_cost numeric(10,2) NOT NULL DEFAULT 0.00,
    marketing_cost numeric(10,2) NOT NULL DEFAULT 0.00,
    status text NOT NULL DEFAULT 'NEW_ORDER',
    reason_category text,
    reason_details text,
    profit numeric(10,2) GENERATED ALWAYS AS (
        order_amount - production_cost - shipping_cost - marketing_cost
    ) STORED,
    sales_agent text NOT NULL,
    is_urgent boolean NOT NULL DEFAULT false,
    is_urgent_approved boolean DEFAULT false,
    lead_source text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.user_profiles(id)
);

CREATE TABLE public.order_history (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    order_id bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_email text NOT NULL,
    field_changed text NOT NULL,
    old_value text,
    new_value text,
    changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.monthly_costs (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    month_year text NOT NULL,
    category text NOT NULL,
    amount numeric(10,2) NOT NULL,
    notes text,
    added_by uuid DEFAULT auth.uid() REFERENCES public.user_profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.order_communications (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    order_id bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.user_profiles(id),
    user_email text,
    recipient_email text NOT NULL,
    subject text,
    body text,
    template_id text,
    visibility text NOT NULL DEFAULT 'INTERNAL',
    sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.email_templates (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    status text NOT NULL UNIQUE,
    template_id text NOT NULL,
    subject text NOT NULL,
    visibility text NOT NULL DEFAULT 'PUBLIC',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- SECTION 3: BUCKET SETUP
-- -----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('order-attachments', 'order-attachments', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('production-files', 'production-files', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true) ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets SET allowed_mime_types = NULL, public = true, file_size_limit = 52428800 WHERE id = 'order-attachments';
UPDATE storage.buckets SET allowed_mime_types = NULL, public = true, file_size_limit = 52428800 WHERE id = 'production-files';
UPDATE storage.buckets SET allowed_mime_types = NULL, public = true, file_size_limit = 52428800 WHERE id = 'logos';

-- SECTION 4: INDEXES
-- -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_sales_agent ON public.orders(sales_agent);

-- SECTION 5: FUNCTIONS & TRIGGERS
-- -----------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 10001;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number = 'PP-' || nextval('public.order_number_seq');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.log_order_changes()
RETURNS TRIGGER AS $$
DECLARE user_email_text text;
BEGIN
    SELECT email INTO user_email_text FROM auth.users WHERE id = auth.uid();
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.order_history (order_id, user_email, field_changed, old_value, new_value)
        VALUES (NEW.id, user_email_text, 'status', OLD.status, NEW.status);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- THE SMART TRIGGER (SILENT REVERSION)
CREATE OR REPLACE FUNCTION public.check_production_updates()
RETURNS TRIGGER AS $$
DECLARE
    user_role text;
    user_perms jsonb;
    current_user_email text;
BEGIN
    SELECT role, permissions, email INTO user_role, user_perms, current_user_email
    FROM public.user_profiles
    WHERE id = auth.uid();

    IF user_role = 'ADMIN' THEN RETURN NEW; END IF;

    -- SCENARIO: PRODUCTION USER
    IF (user_perms->>'orders_edit_production')::boolean = true 
       AND (user_perms->>'orders_edit_financials')::boolean = false THEN
       
       IF NEW.status IS DISTINCT FROM OLD.status THEN
           RAISE EXCEPTION 'Permission Denied: Production team cannot change Order Status.';
       END IF;

       NEW.customer_name := OLD.customer_name;
       NEW.customer_email := OLD.customer_email;
       NEW.shipping_address := OLD.shipping_address;
       NEW.sales_agent := OLD.sales_agent;
       NEW.order_amount := OLD.order_amount;
       NEW.amount_paid := OLD.amount_paid;
       NEW.production_cost := OLD.production_cost;
       NEW.shipping_cost := OLD.shipping_cost;
       NEW.marketing_cost := OLD.marketing_cost;
       NEW.profit := OLD.profit;
       NEW.lead_source := OLD.lead_source;
       
       RETURN NEW;
    END IF;

    -- SCENARIO: SALES AGENT
    IF (user_perms->>'orders_change_status')::boolean = true 
       AND (user_perms->>'orders_view_all')::boolean = false THEN
       IF OLD.sales_agent IS DISTINCT FROM current_user_email THEN
            RAISE EXCEPTION 'Permission Denied: You can only edit your own orders.';
       END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.has_permission(required_permission text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    user_perms jsonb;
BEGIN
    SELECT permissions INTO user_perms FROM public.user_profiles WHERE id = auth.uid();
    RETURN COALESCE((user_perms->>required_permission)::boolean, false);
END;
$$;

GRANT INSERT ON public.user_profiles TO postgres;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    IF new.email ILIKE 'hello@pandapatches.com' THEN
        INSERT INTO public.user_profiles (id, email, full_name, role, permissions)
        VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', 'ADMIN',
            '{"users_manage": true, "orders_create": true, "orders_view_all": true, "orders_change_status": true, "orders_edit_financials": true, "orders_edit_production": true, "orders_delete": true, "reports_view_financials": true, "shipping_view": true}'::jsonb);
    ELSE
        INSERT INTO public.user_profiles (id, email, full_name, role, permissions)
        VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', 'USER', '{"users_manage": false, "orders_create": true, "orders_view_all": false, "orders_change_status": true, "orders_edit_financials": false, "orders_edit_production": false, "orders_delete": false, "reports_view_financials": false, "shipping_view": true}'::jsonb);
    END IF;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SECTION 6: VIEWS
-- -----------------------------------------------------------------
DROP VIEW IF EXISTS public.orders_with_details;

CREATE OR REPLACE VIEW public.orders_with_details AS
SELECT
  id,
  order_number AS "orderNumber",
  customer_name AS "customerName",
  customer_email AS "customerEmail",
  customer_phone AS "customerPhone",
  customer_profile_url AS "customerProfileUrl",
  shipping_address AS "shippingAddress",
  design_name AS "designName",
  instructions,
  production_file_urls AS "productionFileUrls",
  shipping_attachment_urls AS "shippingAttachmentUrls",
  design_size AS "designSize",
  design_backing AS "designBacking",
  patches_type AS "patchesType",
  patches_quantity AS "patchesQuantity",
  revision_notes AS "revisionNotes",
  customer_attachment_urls AS "customerAttachmentUrls",
  mockup_urls AS "mockupUrls",
  redo_notes AS "redoNotes",
  redo_attachments AS "redoAttachments",
  packing,
  shipping_carrier as courier,
  shipping_tracking_number AS "trackingNumber",
  order_amount AS "orderAmount",
  amount_paid AS "amountPaid",
  production_cost AS "productionCost",
  shipping_cost AS "shippingCost",
  marketing_cost AS "marketingCost",
  status,
  profit,
  sales_agent AS "salesAgent",
  is_urgent AS "isUrgent",
  is_urgent_approved AS "isUrgentApproved",
  lead_source AS "leadSource",
  created_at AS "createdAt",
  updated_at AS "updatedAt",
  created_by AS "createdBy",
  (order_amount - amount_paid) AS "amountRemaining",
  -- ✅ These allow filtering with snake_case
  created_at,
  order_number
FROM public.orders;

GRANT SELECT ON public.orders_with_details TO authenticated;

CREATE OR REPLACE VIEW public.sales_agent_reports AS
WITH agent_metrics AS (
  SELECT
      sales_agent,
      CASE WHEN (public.has_permission('reports_view_financials') OR (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN') THEN SUM(order_amount) ELSE NULL END AS total_sales_amount,
      CASE WHEN (public.has_permission('reports_view_financials') OR (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN') THEN SUM(profit) ELSE NULL END AS total_profit,
      COUNT(id) AS total_orders,
      SUM(amount_paid) AS total_amount_paid,
      SUM(order_amount - amount_paid) AS total_amount_remaining,
      AVG(profit) AS average_profit_per_order
  FROM public.orders GROUP BY sales_agent
),
agent_status_counts AS (
  SELECT sales_agent, jsonb_object_agg(status, status_count) AS orders_by_status
  FROM (SELECT sales_agent, status, COUNT(*) AS status_count FROM public.orders GROUP BY sales_agent, status) AS status_subquery
  GROUP BY sales_agent
)
SELECT * FROM agent_metrics JOIN agent_status_counts USING (sales_agent);

-- SECTION 7: RLS & PERMISSIONS
-- -----------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER VIEW public.sales_agent_reports OWNER TO postgres;

-- Policies (Profiles)
DROP POLICY IF EXISTS "users_read_own" ON public.user_profiles;
CREATE POLICY "users_read_own" ON public.user_profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "admins_manage_all" ON public.user_profiles;
CREATE POLICY "admins_manage_all" ON public.user_profiles FOR ALL USING (public.has_permission('users_manage'));

-- Policies (Orders)
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND (p.role = 'ADMIN' OR (p.permissions ->> 'orders_view_all')::boolean OR orders.sales_agent = p.email))
);
DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
CREATE POLICY "orders_insert_policy" ON public.orders FOR INSERT WITH CHECK (public.has_permission('orders_create'));
DROP POLICY IF EXISTS "orders_update_admin" ON public.orders;
CREATE POLICY "orders_update_admin" ON public.orders FOR UPDATE USING ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN') WITH CHECK (true);
DROP POLICY IF EXISTS "orders_update_sales_agent" ON public.orders;
CREATE POLICY "orders_update_sales_agent" ON public.orders FOR UPDATE USING (sales_agent = (SELECT email FROM public.user_profiles WHERE id = auth.uid())) WITH CHECK (true);
DROP POLICY IF EXISTS "orders_update_production" ON public.orders;
CREATE POLICY "orders_update_production" ON public.orders FOR UPDATE USING (public.has_permission('orders_edit_production')) WITH CHECK (true); 
DROP POLICY IF EXISTS "users_delete_orders" ON public.orders;
CREATE POLICY "users_delete_orders" ON public.orders FOR DELETE USING (public.has_permission('orders_delete'));

-- Policies (History/Comms)
DROP POLICY IF EXISTS "team_manage_history" ON public.order_history;
CREATE POLICY "team_manage_history" ON public.order_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "team_manage_comms" ON public.order_communications;
CREATE POLICY "team_manage_comms" ON public.order_communications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Policies (Settings)
-- Policies (Storage - CRITICAL FIX)
DROP POLICY IF EXISTS "Allow authenticated uploads to logos" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK ( bucket_id = 'logos' );
DROP POLICY IF EXISTS "Allow authenticated updates to logos" ON storage.objects;
CREATE POLICY "Allow authenticated updates to logos" ON storage.objects FOR UPDATE TO authenticated USING ( bucket_id = 'logos' );
DROP POLICY IF EXISTS "Allow public viewing of logos" ON storage.objects;
CREATE POLICY "Allow public viewing of logos" ON storage.objects FOR SELECT TO public USING ( bucket_id = 'logos' );

-- Add MISSING Policies for Production Files & Order Attachments
DROP POLICY IF EXISTS "Public Select production-files" ON storage.objects;
CREATE POLICY "Public Select production-files" ON storage.objects FOR SELECT TO public USING (bucket_id = 'production-files');
DROP POLICY IF EXISTS "Auth Insert production-files" ON storage.objects;
CREATE POLICY "Auth Insert production-files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'production-files');
DROP POLICY IF EXISTS "Auth Update production-files" ON storage.objects;
CREATE POLICY "Auth Update production-files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'production-files');

DROP POLICY IF EXISTS "Public Select order-attachments" ON storage.objects;
CREATE POLICY "Public Select order-attachments" ON storage.objects FOR SELECT TO public USING (bucket_id = 'order-attachments');
DROP POLICY IF EXISTS "Auth Insert order-attachments" ON storage.objects;
CREATE POLICY "Auth Insert order-attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'order-attachments');
DROP POLICY IF EXISTS "Auth Update order-attachments" ON storage.objects;
CREATE POLICY "Auth Update order-attachments" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'order-attachments');
-- ✅ Add missing DELETE policy
DROP POLICY IF EXISTS "Auth Delete order-attachments" ON storage.objects;
CREATE POLICY "Auth Delete order-attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'order-attachments');

-- SECTION 8: TRIGGERS
-- -----------------------------------------------------------------
DROP TRIGGER IF EXISTS on_order_insert_generate_number ON public.orders;
DROP TRIGGER IF EXISTS on_orders_update ON public.orders;
DROP TRIGGER IF EXISTS trigger_log_order_changes ON public.orders;
DROP TRIGGER IF EXISTS trigger_check_production_updates ON public.orders;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_order_insert_generate_number BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();
CREATE TRIGGER on_orders_update BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trigger_log_order_changes AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_order_changes();
CREATE TRIGGER trigger_check_production_updates BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.check_production_updates();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SECTION 9: BOOTSTRAP ADMIN
-- -----------------------------------------------------------------
DO $$
DECLARE admin_id uuid;
BEGIN
    SELECT id INTO admin_id FROM auth.users WHERE email = 'hello@pandapatches.com';
    IF admin_id IS NOT NULL THEN
        INSERT INTO public.user_profiles (id, email, full_name, role, permissions)
        VALUES (admin_id, 'hello@pandapatches.com', 'Panda Super Admin', 'ADMIN', '{"users_manage": true, "orders_create": true, "orders_view_all": true, "orders_change_status": true, "orders_edit_financials": true, "orders_edit_production": true, "orders_delete": true, "reports_view_financials": true, "shipping_view": true}'::jsonb)
        ON CONFLICT (id) DO UPDATE SET role = 'ADMIN', permissions = '{"users_manage": true, "orders_create": true, "orders_view_all": true, "orders_change_status": true, "orders_edit_financials": true, "orders_edit_production": true, "orders_delete": true, "reports_view_financials": true, "shipping_view": true}'::jsonb;
    END IF;
END $$;

-- SECTION 10: SETTINGS TABLE (FINAL FIX)
-- -----------------------------------------------------------------
-- 1. Ensure Table Correctness (Idempotent)
CREATE TABLE IF NOT EXISTS public.settings (
  id text PRIMARY KEY,
  logo_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure column exists
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS logo_url text;

-- Ensure row exists (Prevent 406 Error)
INSERT INTO public.settings (id, logo_url)
VALUES ('global_settings', NULL)
ON CONFLICT (id) DO NOTHING;

-- 2. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- 3. PERMISSIONS
-- A. PUBLIC READ (Everyone can SEE the logo so it loads on the dashboard)
DROP POLICY IF EXISTS "Public read settings" ON public.settings;
CREATE POLICY "Public read settings" ON public.settings FOR SELECT TO public USING (true);

-- B. ADMIN WRITE (Only Admins can CHANGE the logo)
DROP POLICY IF EXISTS "Admin update settings" ON public.settings;
CREATE POLICY "Admin update settings" ON public.settings FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'ADMIN')) 
WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'ADMIN'));

SELECT '✅ SETTINGS SECURED: ADMIN ONLY WRITE' as status;