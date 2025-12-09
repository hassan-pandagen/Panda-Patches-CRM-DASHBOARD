-- =================================================================
-- Migration: Fix RLS recursion and update schema
-- Purpose: Remove infinite recursion in user_profiles RLS, sync all tables
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
  permissions jsonb DEFAULT '{}'::jsonb,
  last_seen timestamptz
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

DROP TABLE IF EXISTS public.attendance_logs CASCADE;
DROP TABLE IF EXISTS public.attendance_sessions CASCADE;

CREATE TABLE public.attendance_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  user_email text NOT NULL,
  user_name text NULL,
  clock_in_time timestamptz NOT NULL,
  clock_out_time timestamptz NULL,
  duration_hours numeric GENERATED ALWAYS AS (
    CASE
      WHEN clock_out_time IS NOT NULL THEN EXTRACT(epoch FROM (clock_out_time - clock_in_time)) / 3600
      ELSE 0
    END
  ) STORED,
  work_date date NOT NULL,
  CONSTRAINT attendance_sessions_pkey PRIMARY KEY (id)
);

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS public.attendance_summary CASCADE;

CREATE TABLE public.attendance_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  user_name text NOT NULL,
  month date NOT NULL, -- First day of month (e.g., 2025-12-01)
  total_days_worked integer DEFAULT 0,
  total_hours numeric(8, 2) DEFAULT 0,
  late_days integer DEFAULT 0,
  overtime_hours numeric(8, 2) DEFAULT 0,
  undertime_hours numeric(8, 2) DEFAULT 0,
  incomplete_days integer DEFAULT 0,
  salary_status text DEFAULT 'PENDING', -- 'PENDING' | 'PROCESSED' | 'PAID'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.attendance_summary 
ADD CONSTRAINT attendance_summary_user_month_unique 
UNIQUE (user_id, month);

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
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status text_ops);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders(customer_email text_ops);
CREATE INDEX IF NOT EXISTS idx_orders_sales_agent ON public.orders(sales_agent text_ops);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders(customer_phone text_ops);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at timestamptz_ops);

-- Indexes for Order History
CREATE INDEX IF NOT EXISTS idx_order_history_order_id 
ON public.order_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_history_order_user 
ON public.order_history(order_id, user_email);

-- Indexes for Order Communications
CREATE INDEX IF NOT EXISTS idx_order_communications_order_id 
ON public.order_communications(order_id);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_user_email ON public.attendance_sessions(user_email);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_date ON public.attendance_sessions(work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_user_id ON public.attendance_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_attendance_summary_user_email ON public.attendance_summary(user_email);
CREATE INDEX IF NOT EXISTS idx_attendance_summary_month ON public.attendance_summary(month);
CREATE INDEX IF NOT EXISTS idx_attendance_summary_user_id ON public.attendance_summary(user_id);


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

CREATE OR REPLACE FUNCTION public.check_production_updates()
RETURNS TRIGGER AS $$
DECLARE
    user_role text;
    user_perms jsonb;
    current_user_email text;
BEGIN
    -- Get current user info
    SELECT role, permissions, email
    INTO user_role, user_perms, current_user_email
    FROM public.user_profiles
    WHERE id = auth.uid();

    IF user_role = 'ADMIN' THEN
        RETURN NEW;
    END IF;

    IF (user_perms->>'orders_edit_production')::boolean = true THEN
       
       IF NEW.status IS DISTINCT FROM OLD.status THEN
           RAISE EXCEPTION 'Permission Denied: Production users cannot change Order Status.';
       END IF;

       NEW.order_amount := OLD.order_amount;
       NEW.amount_paid := OLD.amount_paid;
       NEW.production_cost := OLD.production_cost;
       NEW.shipping_cost := OLD.shipping_cost;
       NEW.marketing_cost := OLD.marketing_cost;

       NEW.customer_name := OLD.customer_name;
       NEW.customer_email := OLD.customer_email;
       NEW.customer_phone := OLD.customer_phone;
       NEW.shipping_address := OLD.shipping_address;
       NEW.sales_agent := OLD.sales_agent;
       NEW.lead_source := OLD.lead_source;
       
       RETURN NEW;
    END IF;

    IF user_role = 'USER' AND (user_perms->>'orders_view_all')::boolean IS NOT TRUE THEN
        
        IF OLD.sales_agent IS DISTINCT FROM current_user_email THEN
            RAISE EXCEPTION 'Permission Denied: You can only edit your own orders.';
       END IF;
        
        IF (user_perms->>'orders_edit_financials')::boolean IS NOT TRUE THEN
            NEW.order_amount := OLD.order_amount;
            NEW.amount_paid := OLD.amount_paid;
            NEW.production_cost := OLD.production_cost;
            NEW.shipping_cost := OLD.shipping_cost;
            NEW.marketing_cost := OLD.marketing_cost;
        END IF;

        RETURN NEW;
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

GRANT SELECT ON auth.users TO postgres;

GRANT INSERT ON public.user_profiles TO postgres;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_email text;
    user_full_name text;
BEGIN
    -- Get user details from auth.users
    SELECT email, raw_user_meta_data->>'full_name'
    INTO user_email, user_full_name
    FROM auth.users
    WHERE id = NEW.id;

    -- Check if the new user is an admin based on their email
    IF user_email ILIKE 'hello@pandapatches.com' THEN
        INSERT INTO public.user_profiles (id, email, full_name, role, permissions)
        VALUES (NEW.id, user_email, user_full_name, 'ADMIN',
            '{"users_manage": true, "orders_create": true, "orders_view_all": true, "orders_change_status": true, "orders_edit_financials": true, "orders_edit_production": true, "orders_delete": true, "reports_view_financials": true, "shipping_view": true}'::jsonb);
    ELSE
        INSERT INTO public.user_profiles (id, email, full_name, role, permissions)
        VALUES (NEW.id, user_email, user_full_name, 'USER', '{"users_manage": false, "orders_create": true, "orders_view_all": false, "orders_change_status": true, "orders_edit_financials": false, "orders_edit_production": false, "orders_delete": false, "reports_view_financials": false, "shipping_view": true}'::jsonb);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SECTION 6: VIEWS
-- -----------------------------------------------------------------
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
  shipping_carrier AS "shippingCarrier",
  shipping_tracking_number AS "shippingTrackingNumber",
  order_amount AS "orderAmount",
  amount_paid AS "amountPaid",
  production_cost AS "productionCost",
  shipping_cost AS "shippingCost",
  marketing_cost AS "marketingCost",
  status,
  reason_category AS "reasonCategory",
  reason_details AS "reasonDetails",
  profit,
  sales_agent AS "salesAgent",
  is_urgent AS "isUrgent",
  is_urgent_approved AS "isUrgentApproved",
  lead_source AS "leadSource",
  created_at AS "createdAt",
  updated_at AS "updatedAt",
  created_by AS "createdBy",
  (order_amount - amount_paid) AS "amountRemaining",
  -- Keep snake_case for filtering
  created_at,
  order_number,
  amount_paid
FROM public.orders;

GRANT SELECT ON public.orders_with_details TO authenticated;

CREATE OR REPLACE VIEW public.sales_agent_reports AS
WITH agent_metrics AS (
  SELECT
      sales_agent,
      CASE WHEN (public.has_permission('reports_view_financials') OR (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN') THEN SUM(order_amount) ELSE NULL END AS "totalSalesAmount",
      CASE WHEN (public.has_permission('reports_view_financials') OR (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN') THEN SUM(profit) ELSE NULL END AS "totalProfit",
      COUNT(id) AS "totalOrders",
      SUM(amount_paid) AS "totalAmountPaid",
      SUM(order_amount - amount_paid) AS "totalAmountRemaining",
      AVG(profit) AS "averageProfitPerOrder"
  FROM public.orders GROUP BY sales_agent
),
agent_status_counts AS (
  SELECT sales_agent, jsonb_object_agg(status, status_count) AS orders_by_status
  FROM (SELECT sales_agent, status, COUNT(*) AS status_count FROM public.orders GROUP BY sales_agent, status) AS status_subquery
  GROUP BY sales_agent
)
SELECT * FROM agent_metrics LEFT JOIN agent_status_counts USING (sales_agent);

-- SECTION 7: RLS & PERMISSIONS
-- -----------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER VIEW public.sales_agent_reports OWNER TO postgres;

-- Policies (Profiles)
-- FIX: Remove recursive RLS policy
DROP POLICY IF EXISTS "users_read_own" ON public.user_profiles;
CREATE POLICY "users_read_own" ON public.user_profiles FOR SELECT USING (auth.uid() = id);

-- Orders policies
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders CASCADE;
DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders CASCADE;
DROP POLICY IF EXISTS "orders_update_policy" ON public.orders CASCADE;
DROP POLICY IF EXISTS "users_delete_orders" ON public.orders CASCADE;

CREATE POLICY "orders_select_policy" 
ON public.orders 
FOR SELECT 
USING (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN'
    OR
    (SELECT (permissions->>'orders_view_all')::boolean FROM public.user_profiles WHERE id = auth.uid()) = true
    OR
    sales_agent = (SELECT email FROM public.user_profiles WHERE id = auth.uid())
);

CREATE POLICY "orders_insert_policy" 
ON public.orders 
FOR INSERT 
WITH CHECK ((SELECT (permissions->>'orders_create')::boolean FROM public.user_profiles WHERE id = auth.uid()) = true);

CREATE POLICY "orders_update_policy"
ON public.orders 
FOR UPDATE 
USING (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN'
    OR
    sales_agent = (SELECT email FROM public.user_profiles WHERE id = auth.uid())
);

-- Order history policies
DROP POLICY IF EXISTS "order_history_select" ON public.order_history CASCADE;
CREATE POLICY "order_history_select" ON public.order_history FOR SELECT USING (true);

-- Order communications policies
DROP POLICY IF EXISTS "order_communications_select" ON public.order_communications CASCADE;
CREATE POLICY "order_communications_select" ON public.order_communications FOR SELECT USING (true);

-- Triggers
DROP TRIGGER IF EXISTS trigger_generate_order_number ON public.orders;
CREATE TRIGGER trigger_generate_order_number BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

DROP TRIGGER IF EXISTS trigger_handle_updated_at ON public.orders;
CREATE TRIGGER trigger_handle_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_check_production_updates ON public.orders;
CREATE TRIGGER trigger_check_production_updates BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.check_production_updates();