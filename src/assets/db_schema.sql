-- =================================================================
-- PANDA PATCHES CRM - MASTER SCHEMA (FIXED)
-- Fix: Moved OLD/NEW column checks from Policy to Trigger
-- =================================================================

-- SECTION 1: CLEANUP
-- -----------------------------------------------------------------
DROP TABLE IF EXISTS public.monthly_costs CASCADE;
DROP TABLE IF EXISTS public.order_history CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP VIEW IF EXISTS public.orders_with_details CASCADE;
DROP VIEW IF EXISTS public.sales_agent_reports CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.order_communications CASCADE;
DROP TABLE IF EXISTS public.email_templates CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;

DROP FUNCTION IF EXISTS public.generate_order_number() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.log_order_changes() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.has_permission(text) CASCADE;
DROP FUNCTION IF EXISTS public.check_production_updates() CASCADE; -- NEW FUNCTION

DROP SEQUENCE IF EXISTS public.order_number_seq CASCADE;

-- SECTION 2: TABLES
-- =================================================================

-- 2.1 User Profiles
CREATE TABLE public.user_profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  role text DEFAULT 'USER',
  permissions jsonb DEFAULT '{
      "can_manage_users": false,
      "view_financials": false,
      "view_production": true,
      "view_shipping": true,
      "can_delete_orders": false
  }'::jsonb
);

-- 2.2 Settings
CREATE TABLE public.settings (
  id text PRIMARY KEY,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2.3 Orders
CREATE TABLE public.orders (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    order_number text,
    customer_name text NOT NULL,
    customer_email text NOT NULL,
    customer_phone text,
    customer_profile_url text,
    shipping_address text,
    design_name text NOT NULL,
    instructions text,
    production_file_urls text[],
    shipping_attachment_urls text[],
    design_size text,
    design_backing text,
    patches_type text,
    patches_quantity integer NOT NULL,
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

COMMENT ON COLUMN public.orders.amount_paid IS 'Total amount paid by the customer so far.';

-- 2.4 Order History
CREATE TABLE public.order_history (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    order_id bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_email text NOT NULL,
    field_changed text NOT NULL,
    old_value text,
    new_value text,
    changed_at timestamptz NOT NULL DEFAULT now()
);

-- 2.5 Monthly Costs
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

-- 2.6 Communications
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

-- 2.7 Email Templates
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
-- =================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- SECTION 4: INDEXES
-- =================================================================
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_sales_agent ON public.orders(sales_agent);

-- SECTION 5: FUNCTIONS
-- =================================================================

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
    -- OLD and NEW are valid here (in triggers)
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.order_history (order_id, user_email, field_changed, old_value, new_value)
        VALUES (NEW.id, user_email_text, 'status', OLD.status, NEW.status);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- New function to replace the complex Policy logic
CREATE OR REPLACE FUNCTION public.check_production_updates()
RETURNS TRIGGER AS $$
DECLARE
    user_role text;
    user_perms jsonb;
BEGIN
    -- Get current user details
    SELECT role, permissions INTO user_role, user_perms
    FROM public.user_profiles
    WHERE id = auth.uid();

    -- If user is Production BUT NOT Admin/Financials
    IF (user_perms->>'view_production')::boolean = true 
       AND (user_perms->>'view_financials')::boolean = false 
       AND user_role != 'ADMIN' THEN
       
       -- Check if they tried to change restricted fields
       -- If ANY of these clauses are true, raise an exception
       IF (NEW.status IS DISTINCT FROM OLD.status OR
           NEW.customer_name IS DISTINCT FROM OLD.customer_name OR
           NEW.customer_email IS DISTINCT FROM OLD.customer_email OR
           NEW.customer_phone IS DISTINCT FROM OLD.customer_phone OR
           NEW.customer_profile_url IS DISTINCT FROM OLD.customer_profile_url OR
           NEW.shipping_address IS DISTINCT FROM OLD.shipping_address OR
           NEW.design_name IS DISTINCT FROM OLD.design_name OR
           NEW.instructions IS DISTINCT FROM OLD.instructions OR
           NEW.design_size IS DISTINCT FROM OLD.design_size OR
           NEW.design_backing IS DISTINCT FROM OLD.design_backing OR
           NEW.patches_type IS DISTINCT FROM OLD.patches_type OR
           NEW.patches_quantity IS DISTINCT FROM OLD.patches_quantity OR
           NEW.packing IS DISTINCT FROM OLD.packing OR
           NEW.shipping_carrier IS DISTINCT FROM OLD.shipping_carrier OR
           NEW.shipping_tracking_number IS DISTINCT FROM OLD.shipping_tracking_number OR
           NEW.order_amount IS DISTINCT FROM OLD.order_amount OR
           NEW.amount_paid IS DISTINCT FROM OLD.amount_paid OR
           NEW.production_cost IS DISTINCT FROM OLD.production_cost OR
           NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost OR
           NEW.marketing_cost IS DISTINCT FROM OLD.marketing_cost OR
           NEW.reason_category IS DISTINCT FROM OLD.reason_category OR
           NEW.reason_details IS DISTINCT FROM OLD.reason_details OR
           NEW.sales_agent IS DISTINCT FROM OLD.sales_agent OR
           NEW.is_urgent IS DISTINCT FROM OLD.is_urgent OR
           NEW.is_urgent_approved IS DISTINCT FROM OLD.is_urgent_approved OR
           NEW.lead_source IS DISTINCT FROM OLD.lead_source) THEN
           
           RAISE EXCEPTION 'Permission Denied: Production users cannot modify these fields.';
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
    -- No special case for admin. Rely purely on the permissions set in the user_profiles table.
    SELECT permissions INTO user_perms 
    FROM public.user_profiles 
    WHERE id = auth.uid();

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
            '{"can_manage_users": true, "view_financials": true, "view_production": true,
              "view_shipping": true, "can_delete_orders": true}');
    ELSE
        INSERT INTO public.user_profiles (id, email, full_name, role, permissions)
        VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', 'USER',
            '{"view_production": false, "view_shipping": true,
              "view_financials": false, "can_manage_users": false, "can_delete_orders": false}');
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SECTION 6: VIEW
-- =================================================================
CREATE OR REPLACE VIEW public.orders_with_details AS
SELECT
  id,
  order_number,
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
  shipping_carrier AS "shippingCarrier",
  shipping_tracking_number AS "shippingTrackingNumber",
  CASE WHEN ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN' OR public.has_permission('view_financials'::text)) THEN order_amount ELSE NULL END AS "orderAmount",
  CASE WHEN ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN' OR public.has_permission('view_financials'::text)) THEN amount_paid ELSE NULL END AS "amountPaid",
  CASE WHEN ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN' OR public.has_permission('view_financials'::text)) THEN production_cost ELSE NULL END AS "productionCost",
  CASE WHEN ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN' OR public.has_permission('view_financials'::text)) THEN shipping_cost ELSE NULL END AS "shippingCost",
  CASE WHEN ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN' OR public.has_permission('view_financials'::text)) THEN marketing_cost ELSE NULL END AS "marketingCost",
  CASE WHEN ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN' OR public.has_permission('view_financials'::text)) THEN profit ELSE NULL END AS profit,
  CASE WHEN ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN' OR public.has_permission('view_financials'::text)) THEN (order_amount - amount_paid) ELSE NULL END AS "amountRemaining",
  status,
  reason_category,
  reason_details,
  sales_agent AS "salesAgent",
  is_urgent AS "isUrgent",
  is_urgent_approved AS "isUrgentApproved",
  lead_source AS "leadSource",
  created_at,
  created_at AS "createdAt",
  updated_at AS "updatedAt",
  created_by AS "createdBy"
FROM public.orders;

-- New View for Sales Agent Reporting
CREATE OR REPLACE VIEW public.sales_agent_reports AS
WITH agent_metrics AS (
  SELECT
      sales_agent,
      COUNT(id) AS total_orders,
      SUM(order_amount) AS total_sales_amount,
      SUM(amount_paid) AS total_amount_paid,
      SUM(order_amount - amount_paid) AS total_amount_remaining,
      AVG(profit) AS average_profit_per_order,
      SUM(profit) AS total_profit
  FROM public.orders
  GROUP BY sales_agent
),
agent_status_counts AS (
  SELECT
      sales_agent,
      jsonb_object_agg(status, status_count) AS orders_by_status
  FROM (
      SELECT sales_agent, status, COUNT(*) AS status_count
      FROM public.orders
      GROUP BY sales_agent, status
  ) AS status_subquery
  GROUP BY sales_agent
)
SELECT * FROM agent_metrics
JOIN agent_status_counts USING (sales_agent);

COMMENT ON VIEW public.sales_agent_reports IS 'Provides aggregated sales and order metrics for each sales agent, respecting RLS on the underlying orders table.';


-- SECTION 7: ENABLE RLS
-- =================================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER VIEW public.sales_agent_reports OWNER TO postgres; -- RLS is enforced on the underlying table

-- SECTION 8: POLICIES
-- =================================================================

-- Profiles
DROP POLICY IF EXISTS "users_read_own" ON public.user_profiles;
CREATE POLICY "users_read_own" ON public.user_profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "admins_manage_all" ON public.user_profiles;
CREATE POLICY "admins_manage_all" ON public.user_profiles FOR ALL USING (public.has_permission('can_manage_users'::text));

-- Orders
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders FOR SELECT USING (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN'
    OR public.has_permission('view_financials'::text) -- Financial staff see all orders
    OR sales_agent = (SELECT email FROM public.user_profiles WHERE id = auth.uid())
    OR (public.has_permission('view_production'::text) AND NOT public.has_permission('view_financials'::text)) -- Production staff see all orders (but not financial fields)
);

DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
CREATE POLICY "orders_insert_policy" ON public.orders FOR INSERT WITH CHECK (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN'
    OR public.has_permission('view_financials'::text)
);

DROP POLICY IF EXISTS "orders_update_admin" ON public.orders;
CREATE POLICY "orders_update_admin" ON public.orders FOR UPDATE USING (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN'
) WITH CHECK (true);

DROP POLICY IF EXISTS "orders_update_sales_agent" ON public.orders;
CREATE POLICY "orders_update_sales_agent" ON public.orders FOR UPDATE USING (
    sales_agent = (SELECT email FROM public.user_profiles WHERE id = auth.uid())
) WITH CHECK (true);

-- Fixed Production Policy: Just checks permission. Detail logic is now in Trigger.
DROP POLICY IF EXISTS "orders_update_production" ON public.orders;
CREATE POLICY "orders_update_production" ON public.orders FOR UPDATE USING (
    public.has_permission('view_production'::text)
    AND NOT public.has_permission('view_financials'::text)
) WITH CHECK (true); 

DROP POLICY IF EXISTS "users_delete_orders" ON public.orders;
CREATE POLICY "users_delete_orders" ON public.orders FOR DELETE USING (public.has_permission('can_delete_orders'::text));

-- Monthly Costs
DROP POLICY IF EXISTS "financial_write_access" ON public.monthly_costs;
CREATE POLICY "financial_write_access" ON public.monthly_costs FOR ALL 
USING (public.has_permission('view_financials'::text)) WITH CHECK (public.has_permission('view_financials'::text));

-- History & Comms
DROP POLICY IF EXISTS "team_manage_history" ON public.order_history;
CREATE POLICY "team_manage_history" ON public.order_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "team_manage_comms" ON public.order_communications;
CREATE POLICY "team_manage_comms" ON public.order_communications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Templates
DROP POLICY IF EXISTS "admins_manage_templates" ON public.email_templates;
CREATE POLICY "admins_manage_templates" ON public.email_templates FOR ALL USING (public.has_permission('can_manage_users'::text));
DROP POLICY IF EXISTS "users_read_templates" ON public.email_templates;
CREATE POLICY "users_read_templates" ON public.email_templates FOR SELECT USING (true);

-- Settings
DROP POLICY IF EXISTS "Allow public read access to settings" ON public.settings;
CREATE POLICY "Allow public read access to settings" ON public.settings FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Allow admins to update settings" ON public.settings;
CREATE POLICY "Allow admins to update settings" ON public.settings FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'ADMIN'
  )
);

-- Storage
DROP POLICY IF EXISTS "Allow authenticated uploads to logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public viewing of logos" ON storage.objects;

CREATE POLICY "Allow authenticated uploads to logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK ( bucket_id = 'logos' );
CREATE POLICY "Allow authenticated updates to logos" ON storage.objects FOR UPDATE TO authenticated USING ( bucket_id = 'logos' );
CREATE POLICY "Allow public viewing of logos" ON storage.objects FOR SELECT TO public USING ( bucket_id = 'logos' );

-- SECTION 8: TRIGGERS
-- =================================================================

CREATE TRIGGER on_order_insert_generate_number
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

CREATE TRIGGER on_orders_update
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_log_order_changes
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_changes();

-- New Trigger to enforce production restrictions
CREATE TRIGGER trigger_check_production_updates
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.check_production_updates();

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SECTION 9: BOOTSTRAP ADMIN
-- =================================================================
DO $$
DECLARE admin_id uuid;
BEGIN
    SELECT id INTO admin_id FROM auth.users WHERE email = 'hello@pandapatches.com';
    IF admin_id IS NOT NULL THEN
        INSERT INTO public.user_profiles (id, email, full_name, role, permissions)
        VALUES (
            admin_id, 
            'hello@pandapatches.com', 
            'Panda Super Admin',
            'ADMIN', 
            '{"can_manage_users": true, "view_financials": true, "view_production": true, "view_shipping": true, "can_delete_orders": true}'::jsonb
        )
        ON CONFLICT (id) DO UPDATE 
            SET role = 'ADMIN', 
                permissions = '{"can_manage_users": true, "view_financials": true, "view_production": true, "view_shipping": true, "can_delete_orders": true}'::jsonb;
    END IF;
END $$;

SELECT '✅ MASTER SCHEMA INSTALLED SUCCESSFULLY (WITH TRIGGER FIX)' AS status;