-- =================================================================
-- COMPLETE SCHEMA: Panda Patches CRM - WITH INDUSTRY-STANDARD ATTENDANCE
-- Status: PRODUCTION READY
-- Updated: Attendance system with PKT timezone, auto-clockout, reporting
-- =================================================================

-- SECTION 0: DROP ALL EXISTING POLICIES FIRST
-- -----------------------------------------------------------------
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT schemaname, tablename, policyname 
              FROM pg_policies 
              WHERE schemaname = 'public') 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
                      r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- SECTION 1: CLEANUP
-- -----------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_check_production_updates ON public.orders;
DROP FUNCTION IF EXISTS public.check_production_updates() CASCADE;
DROP VIEW IF EXISTS public.orders_with_details;
DROP VIEW IF EXISTS public.sales_agent_reports;
DROP VIEW IF EXISTS public.active_attendance_sessions;
DROP FUNCTION IF EXISTS public.auto_close_stale_sessions() CASCADE;
DROP FUNCTION IF EXISTS public.validate_clock_in() CASCADE;
DROP FUNCTION IF EXISTS public.get_work_date(timestamptz) CASCADE;
DROP FUNCTION IF EXISTS public.admin_force_clock_out(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.handle_attendance_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.get_attendance_stats(uuid, date, date) CASCADE;

-- SECTION 2: TABLES (IF NOT EXISTS - Safe)
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
    instructions text,
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
    created_by uuid DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.quotes (
     id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
     quote_number text UNIQUE NOT NULL,
     customer_name text NOT NULL,
     customer_email text,
     customer_phone text,
     customer_profile_url text,
     design_name text,
     patches_quantity integer DEFAULT 0,
     patches_type text,
     design_size text,
     design_backing text,
     instructions text,
     estimated_amount numeric(10,2),
     notes text,
     mockup_urls text[],
     customer_attachment_urls text[],
     sales_agent text NOT NULL,
     lead_source text,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     created_by uuid DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE SET NULL
 );

CREATE TABLE IF NOT EXISTS public.order_history (
     id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
     order_id bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
     user_email text NOT NULL,
     field_changed text NOT NULL,
     old_value text,
     new_value text,
     changed_at timestamptz NOT NULL DEFAULT now()
 );

CREATE TABLE IF NOT EXISTS public.monthly_costs (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    month_year text NOT NULL,
    category text NOT NULL,
    amount numeric(10,2) NOT NULL,
    notes text,
    added_by uuid DEFAULT auth.uid() REFERENCES public.user_profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_communications (
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

CREATE TABLE IF NOT EXISTS public.email_templates (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    status text NOT NULL UNIQUE,
    template_id text NOT NULL,
    subject text NOT NULL,
    visibility text NOT NULL DEFAULT 'PUBLIC',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ✅ UPDATED: Attendance Sessions with auto_clocked_out column
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  user_name text NOT NULL,
  clock_in_time timestamptz NOT NULL,
  clock_out_time timestamptz NULL,
  duration_hours numeric GENERATED ALWAYS AS (
    CASE
      WHEN clock_out_time IS NOT NULL THEN EXTRACT(epoch FROM (clock_out_time - clock_in_time)) / 3600
      ELSE 0
    END
  ) STORED,
  work_date date NOT NULL,
  auto_clocked_out boolean DEFAULT FALSE,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT attendance_sessions_pkey PRIMARY KEY (id)
);

-- Add comment for documentation
COMMENT ON COLUMN public.attendance_sessions.auto_clocked_out IS 
'True if session was automatically closed (forgot to clock out, exceeded 10 hours, or force closed by admin)';

CREATE TABLE IF NOT EXISTS public.attendance_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  user_name text NOT NULL,
  month date NOT NULL,
  total_days_worked integer DEFAULT 0,
  updated_at timestamptz,
  total_hours numeric(8, 2) DEFAULT 0,
  late_days integer DEFAULT 0,
  overtime_hours numeric(8, 2) DEFAULT 0,
  undertime_hours numeric(8, 2) DEFAULT 0,
  incomplete_days integer DEFAULT 0,
  salary_status text DEFAULT 'PENDING',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT attendance_summary_user_month_unique UNIQUE (user_id, month)
);

CREATE TABLE IF NOT EXISTS public.performance_metrics (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email text NOT NULL,
    metric_name text NOT NULL,
    metric_type text NOT NULL,
    duration_ms numeric(10, 2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb
);

-- SECTION 2.1: SCHEMA MIGRATIONS / ALTERATIONS
-- -----------------------------------------------------------------
ALTER TABLE public.attendance_sessions 
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.attendance_sessions 
ADD COLUMN IF NOT EXISTS auto_clocked_out boolean DEFAULT FALSE;

-- SECTION 3: BUCKET SETUP
-- -----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('order-attachments', 'order-attachments', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('production-files', 'production-files', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('quote-mockups', 'quote-mockups', true) ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets SET allowed_mime_types = NULL, public = true, file_size_limit = 52428800 WHERE id = 'order-attachments';
UPDATE storage.buckets SET allowed_mime_types = NULL, public = true, file_size_limit = 52428800 WHERE id = 'production-files';
UPDATE storage.buckets SET allowed_mime_types = NULL, public = true, file_size_limit = 52428800 WHERE id = 'quote-mockups';

-- SECTION 3.1: STORAGE POLICIES
-- -----------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
    END LOOP;
END $$;

CREATE POLICY "allow_authenticated_upload_order_attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'order-attachments');

CREATE POLICY "allow_authenticated_upload_production_files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'production-files');

CREATE POLICY "allow_authenticated_upload_quote_mockups"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quote-mockups');

CREATE POLICY "allow_public_read_order_attachments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'order-attachments');

CREATE POLICY "allow_public_read_production_files"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'production-files');

CREATE POLICY "allow_public_read_quote_mockups"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'quote-mockups');

CREATE POLICY "allow_authenticated_delete_order_attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'order-attachments');

CREATE POLICY "allow_authenticated_delete_production_files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'production-files');

CREATE POLICY "allow_authenticated_delete_quote_mockups"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'quote-mockups');

-- SECTION 4: INDEXES
-- -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status text_ops);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders(customer_email text_ops);
CREATE INDEX IF NOT EXISTS idx_orders_sales_agent ON public.orders(sales_agent text_ops);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders(customer_phone text_ops);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at timestamptz_ops);
CREATE INDEX IF NOT EXISTS idx_quotes_quote_number ON public.quotes(quote_number);
CREATE INDEX IF NOT EXISTS idx_quotes_customer_email ON public.quotes(customer_email text_ops);
CREATE INDEX IF NOT EXISTS idx_quotes_sales_agent ON public.quotes(sales_agent text_ops);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON public.quotes(created_at timestamptz_ops);
CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON public.order_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_history_order_user ON public.order_history(order_id, user_email);
CREATE INDEX IF NOT EXISTS idx_order_communications_order_id ON public.order_communications(order_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_user_id ON public.attendance_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_user_email ON public.attendance_sessions(user_email);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_date ON public.attendance_sessions(work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_active ON public.attendance_sessions(user_id) WHERE clock_out_time IS NULL;

-- Ensures each user can only have ONE active session
DROP INDEX IF EXISTS idx_attendance_one_active_session;
CREATE UNIQUE INDEX idx_attendance_one_active_session ON public.attendance_sessions (user_id) WHERE clock_out_time IS NULL;

-- ✅ NEW: Index for auto-clocked sessions
CREATE INDEX IF NOT EXISTS idx_attendance_auto_clocked 
ON public.attendance_sessions (auto_clocked_out) 
WHERE auto_clocked_out = TRUE;

CREATE INDEX IF NOT EXISTS idx_attendance_summary_user_id ON public.attendance_summary(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_summary_month ON public.attendance_summary(month);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_user_id ON public.performance_metrics(user_id);

-- SECTION 5: FUNCTIONS & TRIGGERS
-- -----------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 10001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number = 'PP-' || nextval('public.order_number_seq');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.generate_quote_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.quote_number = 'QT-' || LPAD(nextval('public.quote_number_seq')::text, 5, '0');
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
    old_row_json json;
    new_row_json json;
    key text;
    old_value text;
    new_value text;
BEGIN
    SELECT email INTO user_email_text FROM auth.users WHERE id = auth.uid();
    IF user_email_text IS NULL THEN user_email_text := 'system'; END IF;

    old_row_json := to_json(OLD);
    new_row_json := to_json(NEW);

    FOR key IN SELECT k FROM json_object_keys(new_row_json) k LOOP
        old_value := old_row_json->>key;
        new_value := new_row_json->>key;

        IF new_value IS DISTINCT FROM old_value THEN
            IF key IN (
                'customer_name', 'customer_email', 'customer_phone', 'customer_profile_url',
                'shipping_address', 'design_name', 'patches_quantity', 'patches_type',
                'design_size', 'design_backing', 'instructions', 'status', 'lead_source',
                'is_urgent', 'shipping_carrier', 'shipping_tracking_number',
                'order_amount', 'amount_paid', 'production_cost', 'shipping_cost', 'marketing_cost',
                'revision_notes', 'redo_notes', 'reason_category', 'reason_details'
            ) THEN
                INSERT INTO public.order_history (order_id, user_email, field_changed, old_value, new_value)
                VALUES (NEW.id, user_email_text, key, COALESCE(old_value, '(empty)'), COALESCE(new_value, '(empty)'));
            ELSIF key IN ('mockup_urls', 'production_file_urls', 'shipping_attachment_urls', 'customer_attachment_urls') THEN
                INSERT INTO public.order_history (order_id, user_email, field_changed, old_value, new_value)
                VALUES (NEW.id, user_email_text, key, 'Files updated', 'Files updated');
            END IF;
        END IF;
    END LOOP;
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
    SELECT role, permissions, email INTO user_role, user_perms, current_user_email
    FROM public.user_profiles WHERE id = auth.uid();

    IF user_role = 'ADMIN' THEN RETURN NEW; END IF;

    IF (user_perms->>'orders_edit_production')::boolean = true AND
      (user_perms->>'orders_change_status')::boolean IS NOT TRUE THEN
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

-- ============================================
-- ATTENDANCE SYSTEM FUNCTIONS (UPDATED)
-- ============================================

-- ✅ UPDATED: Work date calculation for Pakistan timezone (5 AM cutoff)
-- Clock-ins before 5 AM PKT count as previous day's shift
CREATE OR REPLACE FUNCTION public.get_work_date(clock_time timestamptz)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  pkt_time timestamptz;
  pkt_hour int;
BEGIN
  -- Convert to Pakistan time (UTC+5)
  pkt_time := clock_time AT TIME ZONE 'Asia/Karachi';
  pkt_hour := EXTRACT(HOUR FROM pkt_time);
  
  -- If before 5 AM PKT, count as previous day's shift
  IF pkt_hour < 5 THEN
    RETURN (pkt_time - interval '1 day')::date;
  ELSE
    RETURN pkt_time::date;
  END IF;
END;
$$;

-- ✅ UPDATED: Recalculate attendance summary with overtime/undertime metrics
CREATE OR REPLACE FUNCTION public.recalculate_attendance_summary()
RETURNS TRIGGER AS $$
DECLARE
    target_user_id uuid;
    target_date date;
    month_start date;
    
    _total_days int;
    _total_hours numeric(10,2);
    _overtime_hours numeric(10,2);
    _undertime_hours numeric(10,2);
    _incomplete_days int;
    _user_email text;
    _user_name text;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        target_user_id := OLD.user_id;
        target_date := OLD.work_date;
        _user_email := OLD.user_email;
        _user_name := OLD.user_name;
    ELSE
        target_user_id := NEW.user_id;
        target_date := NEW.work_date;
        _user_email := NEW.user_email;
        _user_name := NEW.user_name;
    END IF;

    month_start := date_trunc('month', target_date);

    -- Calculate all metrics with new thresholds:
    -- Overtime: > 9 hours (excess over 8)
    -- Undertime: < 7.5 hours (deficit from 8)
    SELECT 
      COUNT(DISTINCT work_date),
      COALESCE(SUM(duration_hours), 0),
      COALESCE(SUM(CASE WHEN duration_hours >= 9 THEN duration_hours - 8 ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN duration_hours < 7.5 AND duration_hours > 0 THEN 8 - duration_hours ELSE 0 END), 0),
      COUNT(CASE WHEN clock_out_time IS NULL OR duration_hours = 0 THEN 1 END)
    INTO _total_days, _total_hours, _overtime_hours, _undertime_hours, _incomplete_days
    FROM public.attendance_sessions
    WHERE user_id = target_user_id 
      AND work_date >= month_start 
      AND work_date < (month_start + interval '1 month');

    INSERT INTO public.attendance_summary (
      user_id, user_email, user_name, month, 
      total_days_worked, total_hours, overtime_hours, undertime_hours, incomplete_days,
      updated_at
    )
    VALUES (
      target_user_id, _user_email, _user_name, month_start,
      _total_days, _total_hours, _overtime_hours, _undertime_hours, _incomplete_days,
      now()
    )
    ON CONFLICT (user_id, month) 
    DO UPDATE SET 
      total_days_worked = EXCLUDED.total_days_worked, 
      total_hours = EXCLUDED.total_hours,
      overtime_hours = EXCLUDED.overtime_hours,
      undertime_hours = EXCLUDED.undertime_hours,
      incomplete_days = EXCLUDED.incomplete_days,
      user_email = EXCLUDED.user_email, 
      updated_at = now();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ✅ UPDATED: Auto-close stale sessions (after 10 hours max)
CREATE OR REPLACE FUNCTION public.auto_close_stale_sessions()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE public.attendance_sessions
  SET 
    clock_out_time = clock_in_time + interval '10 hours',
    auto_clocked_out = TRUE
  WHERE 
    clock_out_time IS NULL 
    AND clock_in_time < (now() - interval '10 hours');
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  
  RETURN json_build_object(
    'success', true,
    'sessions_closed', affected_count,
    'closed_at', now()
  );
END;
$$;

-- ✅ Validation trigger to prevent clock-in if already active
CREATE OR REPLACE FUNCTION public.validate_clock_in()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  active_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO active_count
  FROM public.attendance_sessions
  WHERE 
    user_id = NEW.user_id 
    AND clock_out_time IS NULL
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  
  IF active_count > 0 THEN
    RAISE EXCEPTION 'User already has an active clock-in session. Please clock out first.';
  END IF;
  
  RETURN NEW;
END;
$$;

-- ✅ Helper functions to prevent RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_profiles WHERE id = auth.uid() LIMIT 1),
    'USER'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_email()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_profiles 
     WHERE id = auth.uid() 
     LIMIT 1) = 'ADMIN',
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT email FROM public.user_profiles WHERE id = auth.uid() LIMIT 1) = 'hello@pandapatches.com',
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(required_permission text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE user_perms jsonb;
BEGIN
    SELECT permissions INTO user_perms FROM public.user_profiles WHERE id = auth.uid();
    RETURN COALESCE((user_perms->>required_permission)::boolean, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_email text;
    user_full_name text;
BEGIN
    SELECT email, raw_user_meta_data->>'full_name' INTO user_email, user_full_name
    FROM auth.users WHERE id = NEW.id;

    IF user_email ILIKE 'hello@pandapatches.com' THEN
        INSERT INTO public.user_profiles (id, email, full_name, role, permissions)
        VALUES (NEW.id, user_email, user_full_name, 'ADMIN', '{"users_manage": true, "orders_create": true, "orders_view_all": true, "orders_change_status": true, "orders_edit_financials": true, "orders_edit_production": true, "orders_delete": true, "reports_view_financials": true, "shipping_view": true}'::jsonb);
    ELSE
        INSERT INTO public.user_profiles (id, email, full_name, role, permissions)
        VALUES (NEW.id, user_email, user_full_name, 'USER', '{"users_manage": false, "orders_create": true, "orders_view_all": false, "orders_change_status": true, "orders_edit_financials": false, "orders_edit_production": false, "orders_delete": false, "reports_view_financials": false, "shipping_view": true}'::jsonb);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ✅ UPDATED: Admin force clock-out with auto_clocked_out flag
CREATE OR REPLACE FUNCTION public.admin_force_clock_out(session_id uuid, admin_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  admin_role text;
  session_data record;
  hours_worked numeric;
BEGIN
  SELECT role INTO admin_role
  FROM public.user_profiles
  WHERE id = admin_user_id;
  
  IF admin_role != 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can force clock out';
  END IF;
  
  SELECT * INTO session_data
  FROM public.attendance_sessions
  WHERE id = session_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;
  
  IF session_data.clock_out_time IS NOT NULL THEN
    RAISE EXCEPTION 'Session already closed';
  END IF;
  
  -- Calculate hours (capped at 10)
  hours_worked := LEAST(
    EXTRACT(EPOCH FROM (now() - session_data.clock_in_time)) / 3600,
    10
  );
  
  UPDATE public.attendance_sessions 
  SET 
    clock_out_time = now(),
    auto_clocked_out = TRUE
  WHERE id = session_id;
  
  RETURN json_build_object(
    'success', true,
    'session_id', session_id,
    'user_email', session_data.user_email,
    'hours_worked', ROUND(hours_worked::numeric, 2),
    'clock_out_time', now()
  );
END;
$$;

-- ✅ NEW: Get attendance statistics for reporting
CREATE OR REPLACE FUNCTION public.get_attendance_stats(
  p_user_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  total_hours numeric;
  total_days int;
  overtime_hours numeric;
  undertime_hours numeric;
  auto_closed_count int;
BEGIN
  SELECT 
    COALESCE(SUM(duration_hours), 0),
    COUNT(DISTINCT work_date),
    COALESCE(SUM(CASE WHEN duration_hours > 9 THEN duration_hours - 8 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN duration_hours < 7.5 AND duration_hours > 0 THEN 8 - duration_hours ELSE 0 END), 0),
    COUNT(CASE WHEN auto_clocked_out = TRUE THEN 1 END)
  INTO total_hours, total_days, overtime_hours, undertime_hours, auto_closed_count
  FROM public.attendance_sessions
  WHERE user_id = p_user_id
    AND work_date >= p_start_date
    AND work_date <= p_end_date
    AND clock_out_time IS NOT NULL;
  
  RETURN json_build_object(
    'user_id', p_user_id,
    'period_start', p_start_date,
    'period_end', p_end_date,
    'total_hours', ROUND(total_hours, 2),
    'total_days', total_days,
    'overtime_hours', ROUND(overtime_hours, 2),
    'undertime_hours', ROUND(undertime_hours, 2),
    'auto_closed_sessions', auto_closed_count,
    'avg_hours_per_day', CASE WHEN total_days > 0 THEN ROUND(total_hours / total_days, 2) ELSE 0 END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_attendance_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

GRANT SELECT ON auth.users TO postgres;
GRANT INSERT ON public.user_profiles TO postgres;

-- SECTION 6: VIEWS
-- -----------------------------------------------------------------
CREATE OR REPLACE VIEW public.orders_with_details AS
SELECT
  id AS id,
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
  (order_amount - amount_paid) AS "amountRemaining"
FROM public.orders;

GRANT SELECT ON public.orders_with_details TO authenticated;

CREATE OR REPLACE VIEW public.sales_agent_reports AS
WITH agent_metrics AS (
  SELECT
      sales_agent,
      CASE WHEN (public.has_permission('reports_view_financials') OR public.is_admin()) THEN SUM(order_amount) ELSE NULL END AS "totalSalesAmount",
      CASE WHEN (public.has_permission('reports_view_financials') OR public.is_admin()) THEN SUM(profit) ELSE NULL END AS "totalProfit",
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

ALTER VIEW public.sales_agent_reports OWNER TO postgres;

-- ✅ UPDATED: Active attendance sessions view with auto-clockout info
CREATE OR REPLACE VIEW public.active_attendance_sessions AS
SELECT 
  s.id,
  s.user_id,
  s.user_email,
  s.user_name,
  s.work_date,
  s.clock_in_time,
  ROUND(EXTRACT(EPOCH FROM (now() - s.clock_in_time)) / 3600, 2) AS hours_active,
  s.clock_in_time + interval '10 hours' AS auto_clockout_at,
  ROUND(EXTRACT(EPOCH FROM ((s.clock_in_time + interval '10 hours') - now())) / 60, 0) AS minutes_until_auto_clockout,
  CASE 
    WHEN (now() - s.clock_in_time) > interval '10 hours' THEN 'AUTO_CLOCKOUT_DUE'
    WHEN (now() - s.clock_in_time) > interval '9 hours' THEN 'WARNING'
    WHEN (now() - s.clock_in_time) > interval '8 hours' THEN 'OVERTIME'
    ELSE 'ACTIVE'
  END AS session_status
FROM public.attendance_sessions s
WHERE s.clock_out_time IS NULL;

-- SECTION 7: RLS & PERMISSIONS
-- -----------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;

-- User Profiles
CREATE POLICY "users_read_own" ON public.user_profiles 
FOR SELECT USING (auth.uid() = id OR public.is_admin() = true);

CREATE POLICY "service_role_full_access"
ON public.user_profiles FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Orders
CREATE POLICY "orders_select_policy" ON public.orders FOR SELECT 
USING (public.is_admin() OR public.has_permission('orders_view_all') OR sales_agent = public.get_user_email());

CREATE POLICY "orders_insert_policy" ON public.orders FOR INSERT 
WITH CHECK (public.has_permission('orders_create'));

CREATE POLICY "orders_update_policy" ON public.orders FOR UPDATE 
USING (public.is_admin() OR sales_agent = public.get_user_email());

CREATE POLICY "orders_delete_policy" ON public.orders FOR DELETE
USING (public.is_admin());

-- Quotes
CREATE POLICY "quotes_select_policy" ON public.quotes FOR SELECT 
USING (public.is_admin() OR public.has_permission('orders_view_all') OR sales_agent = public.get_user_email());

CREATE POLICY "quotes_insert_policy" ON public.quotes FOR INSERT 
WITH CHECK (public.has_permission('orders_create'));

CREATE POLICY "service_role_quotes_full_access"
ON public.quotes FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "quotes_update_policy" ON public.quotes FOR UPDATE 
USING (public.is_admin() OR sales_agent = public.get_user_email());

CREATE POLICY "quotes_delete_policy" ON public.quotes FOR DELETE
USING (public.is_admin() OR sales_agent = public.get_user_email());

-- Order History
CREATE POLICY "order_history_select" ON public.order_history FOR SELECT 
USING (public.is_admin() OR order_id IN (SELECT id FROM public.orders WHERE sales_agent = public.get_user_email()));

CREATE POLICY "order_history_insert" ON public.order_history FOR INSERT
WITH CHECK (public.is_admin() OR user_email = public.get_user_email());

CREATE POLICY "order_history_delete" ON public.order_history FOR DELETE
USING (public.is_admin());

GRANT INSERT ON public.order_history TO authenticated;

-- Order Communications
CREATE POLICY "order_communications_select" ON public.order_communications FOR SELECT USING (public.is_admin());
CREATE POLICY "order_communications_insert" ON public.order_communications FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "order_communications_delete" ON public.order_communications FOR DELETE USING (public.is_admin());

-- Monthly Costs
CREATE POLICY "monthly_costs_select" ON public.monthly_costs FOR SELECT USING (public.is_admin());
CREATE POLICY "monthly_costs_insert" ON public.monthly_costs FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "monthly_costs_update" ON public.monthly_costs FOR UPDATE USING (public.is_admin());
CREATE POLICY "monthly_costs_delete" ON public.monthly_costs FOR DELETE USING (public.is_admin());

-- Email Templates
CREATE POLICY "email_templates_select" ON public.email_templates FOR SELECT USING (true);
CREATE POLICY "email_templates_insert" ON public.email_templates FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "email_templates_update" ON public.email_templates FOR UPDATE USING (public.is_admin());
CREATE POLICY "email_templates_delete" ON public.email_templates FOR DELETE USING (public.is_admin());

-- Attendance Sessions
CREATE POLICY "attendance_sessions_select" ON public.attendance_sessions FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "attendance_sessions_insert" ON public.attendance_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "attendance_sessions_update" ON public.attendance_sessions FOR UPDATE
USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "attendance_sessions_delete" ON public.attendance_sessions FOR DELETE
USING (public.is_admin());

-- Attendance Summary
CREATE POLICY "attendance_summary_select_final" ON public.attendance_summary FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "attendance_summary_insert_final" ON public.attendance_summary FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "attendance_summary_update_final" ON public.attendance_summary FOR UPDATE
USING (public.is_admin());

-- Performance Metrics
CREATE POLICY "perf_metrics_select" ON public.performance_metrics FOR SELECT
USING (public.is_super_admin());

CREATE POLICY "perf_metrics_insert" ON public.performance_metrics FOR INSERT
WITH CHECK (true);

CREATE POLICY "perf_metrics_delete" ON public.performance_metrics FOR DELETE
USING (public.is_super_admin());

-- Grant access to views
GRANT SELECT ON public.active_attendance_sessions TO authenticated;
GRANT SELECT ON public.sales_agent_reports TO authenticated;

-- SECTION 8: TRIGGERS
-- -----------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_generate_order_number ON public.orders;
CREATE TRIGGER trigger_generate_order_number BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

DROP TRIGGER IF EXISTS trigger_generate_quote_number ON public.quotes;
CREATE TRIGGER trigger_generate_quote_number BEFORE INSERT ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.generate_quote_number();

DROP TRIGGER IF EXISTS trigger_handle_updated_at ON public.orders;
CREATE TRIGGER trigger_handle_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_check_production_updates ON public.orders;
CREATE TRIGGER trigger_check_production_updates BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.check_production_updates();

DROP TRIGGER IF EXISTS trigger_log_order_changes ON public.orders;
CREATE TRIGGER trigger_log_order_changes AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_order_changes();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS trigger_update_attendance_summary ON public.attendance_sessions;
CREATE TRIGGER trigger_update_attendance_summary AFTER INSERT OR UPDATE OR DELETE ON public.attendance_sessions FOR EACH ROW EXECUTE FUNCTION public.recalculate_attendance_summary();

DROP TRIGGER IF EXISTS trigger_validate_clock_in ON public.attendance_sessions;
CREATE TRIGGER trigger_validate_clock_in BEFORE INSERT ON public.attendance_sessions FOR EACH ROW EXECUTE FUNCTION public.validate_clock_in();

DROP TRIGGER IF EXISTS trigger_attendance_updated_at ON public.attendance_sessions;
CREATE TRIGGER trigger_attendance_updated_at BEFORE UPDATE ON public.attendance_sessions FOR EACH ROW EXECUTE FUNCTION public.handle_attendance_updated_at();

-- SECTION 9: VERIFICATION
-- -----------------------------------------------------------------
SELECT 'Schema setup complete!' as status;
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('get_user_role', 'get_user_email', 'is_admin', 'is_super_admin', 'has_permission', 'get_work_date', 'get_attendance_stats');

-- SECTION 10: DATA MIGRATION
-- -----------------------------------------------------------------
UPDATE user_profiles
SET permissions = jsonb_set(permissions, '{orders_view_own_only}', 'true'::jsonb)
WHERE role != 'ADMIN'
  AND (permissions->>'orders_view_own_only' IS NULL OR permissions->>'orders_view_own_only' = 'false');

SELECT 
  'Migration: orders_view_own_only permission added' as migration_status,
  COUNT(*) as non_admin_users_updated
FROM user_profiles 
WHERE role != 'ADMIN' AND permissions->>'orders_view_own_only' = 'true';

-- SECTION 11: ATTENDANCE SYSTEM CONFIGURATION REFERENCE
-- -----------------------------------------------------------------
-- This is a reference comment for the attendance system configuration.
-- The actual configuration is in the TypeScript code (useClockInOut.ts).
--
-- SHIFT_CONFIG = {
--   REQUIRED_HOURS: 8,           -- Standard shift duration
--   OVERTIME_THRESHOLD: 9,       -- Hours after which overtime starts  
--   UNDERTIME_THRESHOLD: 7.5,    -- Hours below which it's undertime
--   MAX_SHIFT_HOURS: 10,         -- Auto clock-out after this many hours
--   SHIFT_CUTOFF_HOUR: 5,        -- 5:00 AM PKT (clock-ins before count as prev day)
--   WORKING_DAYS: Mon-Sat,       -- Sunday off
-- }