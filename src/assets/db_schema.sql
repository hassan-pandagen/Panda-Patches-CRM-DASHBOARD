-- =================================================================
-- PANDA PATCHES CRM - FINAL MASTER SETUP (COMPLETE 7 SECTIONS)
-- =================================================================

-- =================================================================
-- SECTION 1: CLEANUP
-- =================================================================
DROP TABLE IF EXISTS public.monthly_costs CASCADE;
DROP TABLE IF EXISTS public.order_history CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP VIEW IF EXISTS public.orders_with_details CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.order_communications CASCADE;
DROP TABLE IF EXISTS public.email_templates CASCADE;

DROP FUNCTION IF EXISTS public.broadcast_urgent_order() CASCADE;
DROP FUNCTION IF EXISTS public.generate_order_number() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.log_order_changes() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.get_sales_report(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_profit_loss_report(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.has_permission(text) CASCADE;
DROP FUNCTION IF EXISTS public.get_claims(uuid) CASCADE;

DROP SEQUENCE IF EXISTS public.order_number_seq CASCADE;

-- =================================================================
-- SECTION 2: TABLES
-- =================================================================

-- USER PROFILES
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

-- ORDERS
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
    courier text,
    tracking_number text,
    order_amount numeric(10,2) NOT NULL DEFAULT 0.00,
    amount_paid numeric(10,2) NOT NULL DEFAULT 0.00,
    production_cost numeric(10,2) NOT NULL DEFAULT 0.00,
    shipping_cost numeric(10,2) NOT NULL DEFAULT 0.00,
    marketing_cost numeric(10,2) NOT NULL DEFAULT 0.00,
    status text NOT NULL DEFAULT 'NEW_ORDER',
    profit numeric(10,2) GENERATED ALWAYS AS (order_amount - production_cost - shipping_cost - marketing_cost) STORED,
    sales_agent text NOT NULL,
    is_urgent boolean NOT NULL DEFAULT false,
    is_urgent_approved boolean DEFAULT false,
    lead_source text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.user_profiles(id)
);

-- ORDER HISTORY
CREATE TABLE public.order_history (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    order_id bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_email text NOT NULL,
    field_changed text NOT NULL,
    old_value text,
    new_value text,
    changed_at timestamptz NOT NULL DEFAULT now()
);

-- MONTHLY COSTS
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

-- ORDER COMMUNICATIONS
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

-- EMAIL TEMPLATES
CREATE TABLE public.email_templates (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    status text NOT NULL UNIQUE,
    template_id text NOT NULL,
    subject text NOT NULL,
    visibility text NOT NULL DEFAULT 'PUBLIC',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =================================================================
-- SECTION 3: INDEXES & VIEWS
-- =================================================================
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_customer_email ON public.orders(customer_email);
CREATE INDEX idx_orders_sales_agent ON public.orders(sales_agent);

-- Drop the old view
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
  courier,
  tracking_number AS "trackingNumber",
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
  
  -- ✅ CRITICAL FIX: Add these columns back for filtering
  created_at,
  order_number
FROM public.orders;

GRANT SELECT ON public.orders_with_details TO authenticated;

-- =================================================================
-- SECTION 4: FUNCTIONS (HYBRID STRATEGY)
-- =================================================================

CREATE SEQUENCE public.order_number_seq START 10001;

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
DECLARE
    user_email_text text;
BEGIN
    SELECT email INTO user_email_text FROM auth.users WHERE id = auth.uid();
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.order_history (order_id, user_email, field_changed, old_value, new_value)
        VALUES (NEW.id, user_email_text, 'status', OLD.status, NEW.status);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ✅ HYBRID PERMISSION CHECK (The Infinite Loop Fix)
CREATE OR REPLACE FUNCTION public.has_permission(required_permission text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_email text;
    user_perms jsonb;
BEGIN
    -- 1. Super Admin Override (JWT Check - Fast, No DB)
    current_email := auth.jwt() ->> 'email';
    IF current_email ILIKE 'hello@pandapatches.com' THEN
        RETURN true;
    END IF;

    -- 2. Regular Users (DB Check)
    SELECT permissions INTO user_perms 
    FROM public.user_profiles 
    WHERE id = auth.uid();
    
    RETURN COALESCE((user_perms->>required_permission)::boolean, false);
END;
$$;

-- Handle New User Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    IF new.email ILIKE 'hello@pandapatches.com' THEN
        INSERT INTO public.user_profiles (id, email, full_name, role, permissions)
        VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', 'ADMIN',
            '{ "can_manage_users": true, "view_financials": true, "view_production": true, "view_shipping": true, "can_delete_orders": true }'::jsonb);
    ELSE
        INSERT INTO public.user_profiles (id, email, full_name, role, permissions)
        VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', 'USER', 
            '{ "view_production": true, "view_shipping": true, "view_financials": false, "can_manage_users": false, "can_delete_orders": false }'::jsonb);
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- SECTION 5: RLS POLICIES
-- =================================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Read own profile" ON public.user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Super Admins can manage all profiles" ON public.user_profiles FOR ALL USING (public.has_permission('can_manage_users') = true);

-- Orders
CREATE POLICY "Users with permission can view orders" ON public.orders FOR SELECT TO authenticated USING (public.has_permission('view_production') = true OR public.has_permission('view_shipping') = true);
CREATE POLICY "Users with permission can create/update orders" ON public.orders FOR INSERT, UPDATE TO authenticated WITH CHECK (true);
CREATE POLICY "Users with delete permission can delete orders" ON public.orders FOR DELETE USING (public.has_permission('can_delete_orders') = true);

-- Monthly Costs
CREATE POLICY "Users with financial permission can access costs" ON public.monthly_costs FOR ALL USING (public.has_permission('view_financials') = true);

-- History & Comms
CREATE POLICY "Team can view history and comms" ON public.order_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team can manage comms" ON public.order_communications FOR ALL TO authenticated USING (true);

-- Email Templates
CREATE POLICY "Admins can manage templates" ON public.email_templates FOR ALL USING (public.has_permission('can_manage_users') = true);
CREATE POLICY "Authenticated users can read templates" ON public.email_templates FOR SELECT TO authenticated USING (true);

-- =================================================================
-- SECTION 6: TRIGGERS
-- =================================================================
CREATE TRIGGER on_order_insert_generate_number BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();
CREATE TRIGGER on_orders_update BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trigger_log_order_changes AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_order_changes();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =================================================================
-- SECTION 7: SEED SUPER ADMIN DATA
-- =================================================================
-- This block guarantees the Admin user exists and has full permissions.
DO $$
DECLARE
    admin_id uuid;
BEGIN
    -- Find the ID of the user in auth.users
    SELECT id INTO admin_id FROM auth.users WHERE email = 'hello@pandapatches.com';
    
    IF admin_id IS NOT NULL THEN
        -- Insert or Update the profile
        INSERT INTO public.user_profiles (id, email, full_name, role, permissions)
        VALUES (
            admin_id,
            'hello@pandapatches.com',
            'Panda Super Admin',
            'ADMIN',
            '{ "can_manage_users": true, "view_financials": true, "view_production": true,
               "view_shipping": true, "can_delete_orders": true }'::jsonb
        )
        ON CONFLICT (id) DO UPDATE
        SET 
            role = 'ADMIN',
            permissions = EXCLUDED.permissions;
    END IF;
END $$;

SELECT '✅ MASTER SETUP COMPLETE (7 SECTIONS). SYSTEM IS READY.' AS status;