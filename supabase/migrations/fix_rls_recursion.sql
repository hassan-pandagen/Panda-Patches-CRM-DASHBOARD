-- Migration: Fix RLS Policy Infinite Recursion
-- Issue: Recursive SELECT statements in RLS policies causing "infinite recursion detected"
-- Solution: Use SECURITY DEFINER helper functions instead of subqueries in policies

-- =====================================================================
-- SECTION 1: CREATE HELPER FUNCTIONS (SECURITY DEFINER)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_email()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT email FROM public.user_profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() AND role = 'ADMIN'
  );
$$;

-- =====================================================================
-- SECTION 2: FIX RLS POLICIES
-- =====================================================================

-- USER PROFILES POLICY
-- ❌ OLD: Caused recursion by querying user_profiles within user_profiles policy
-- ✅ NEW: Just check the current row's role
DROP POLICY IF EXISTS "users_read_own" ON public.user_profiles;
CREATE POLICY "users_read_own" ON public.user_profiles 
FOR SELECT USING (
  auth.uid() = id OR role = 'ADMIN'
);

-- ORDERS POLICIES
-- ❌ OLD: Subqueries triggered user_profiles policy, causing recursion
-- ✅ NEW: Use SECURITY DEFINER functions
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders FOR SELECT USING (
    public.is_admin()
    OR public.has_permission('orders_view_all')
    OR sales_agent = public.get_user_email()
);

DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
CREATE POLICY "orders_update_policy" ON public.orders FOR UPDATE USING (
    public.is_admin() 
    OR sales_agent = public.get_user_email()
);

DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
CREATE POLICY "orders_insert_policy" ON public.orders FOR INSERT 
WITH CHECK (public.has_permission('orders_create'));

DROP POLICY IF EXISTS "orders_delete_policy" ON public.orders;
CREATE POLICY "orders_delete_policy" ON public.orders FOR DELETE 
USING (public.is_admin());

-- SETTINGS POLICIES
DROP POLICY IF EXISTS "settings_read_all" ON public.settings;
CREATE POLICY "settings_read_all" ON public.settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "settings_update_admin" ON public.settings;
CREATE POLICY "settings_update_admin" ON public.settings FOR UPDATE 
USING (public.is_admin());

DROP POLICY IF EXISTS "settings_insert_admin" ON public.settings;
CREATE POLICY "settings_insert_admin" ON public.settings FOR INSERT 
WITH CHECK (public.is_admin());

-- ORDER HISTORY POLICIES
DROP POLICY IF EXISTS "order_history_select" ON public.order_history;
CREATE POLICY "order_history_select" ON public.order_history FOR SELECT USING (
    public.is_admin()
    OR order_id IN (
        SELECT id FROM public.orders WHERE sales_agent = public.get_user_email()
    )
);

DROP POLICY IF EXISTS "order_history_insert" ON public.order_history;
CREATE POLICY "order_history_insert" ON public.order_history FOR INSERT WITH CHECK (
    public.is_admin() 
    OR user_email = public.get_user_email()
);

DROP POLICY IF EXISTS "order_history_delete" ON public.order_history;
CREATE POLICY "order_history_delete" ON public.order_history FOR DELETE 
USING (public.is_admin());

-- MONTHLY COSTS POLICIES
DROP POLICY IF EXISTS "monthly_costs_select" ON public.monthly_costs;
CREATE POLICY "monthly_costs_select" ON public.monthly_costs FOR SELECT 
USING (public.is_admin());

DROP POLICY IF EXISTS "monthly_costs_insert" ON public.monthly_costs;
CREATE POLICY "monthly_costs_insert" ON public.monthly_costs FOR INSERT 
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "monthly_costs_update" ON public.monthly_costs;
CREATE POLICY "monthly_costs_update" ON public.monthly_costs FOR UPDATE 
USING (public.is_admin());

DROP POLICY IF EXISTS "monthly_costs_delete" ON public.monthly_costs;
CREATE POLICY "monthly_costs_delete" ON public.monthly_costs FOR DELETE 
USING (public.is_admin());

-- ORDER COMMUNICATIONS POLICIES
DROP POLICY IF EXISTS "order_communications_select" ON public.order_communications;
CREATE POLICY "order_communications_select" ON public.order_communications FOR SELECT USING (
    public.is_admin()
    OR order_id IN (
        SELECT id FROM public.orders WHERE sales_agent = public.get_user_email()
    )
);

DROP POLICY IF EXISTS "order_communications_insert" ON public.order_communications;
CREATE POLICY "order_communications_insert" ON public.order_communications FOR INSERT 
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "order_communications_delete" ON public.order_communications;
CREATE POLICY "order_communications_delete" ON public.order_communications FOR DELETE 
USING (public.is_admin());

-- EMAIL TEMPLATES POLICIES
DROP POLICY IF EXISTS "email_templates_select" ON public.email_templates;
CREATE POLICY "email_templates_select" ON public.email_templates FOR SELECT USING (true);

DROP POLICY IF EXISTS "email_templates_insert" ON public.email_templates;
CREATE POLICY "email_templates_insert" ON public.email_templates FOR INSERT 
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "email_templates_update" ON public.email_templates;
CREATE POLICY "email_templates_update" ON public.email_templates FOR UPDATE 
USING (public.is_admin());

DROP POLICY IF EXISTS "email_templates_delete" ON public.email_templates;
CREATE POLICY "email_templates_delete" ON public.email_templates FOR DELETE 
USING (public.is_admin());

-- ATTENDANCE SESSIONS POLICIES
DROP POLICY IF EXISTS "attendance_sessions_select" ON public.attendance_sessions;
CREATE POLICY "attendance_sessions_select" ON public.attendance_sessions FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "attendance_sessions_insert" ON public.attendance_sessions;
CREATE POLICY "attendance_sessions_insert" ON public.attendance_sessions FOR INSERT 
WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "attendance_sessions_update" ON public.attendance_sessions;
CREATE POLICY "attendance_sessions_update" ON public.attendance_sessions FOR UPDATE
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "attendance_sessions_delete" ON public.attendance_sessions;
CREATE POLICY "attendance_sessions_delete" ON public.attendance_sessions FOR DELETE
USING (public.is_admin());

-- ATTENDANCE SUMMARY POLICIES
DROP POLICY IF EXISTS "attendance_summary_select" ON public.attendance_summary;
CREATE POLICY "attendance_summary_select" ON public.attendance_summary FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "attendance_summary_insert" ON public.attendance_summary;
CREATE POLICY "attendance_summary_insert" ON public.attendance_summary FOR INSERT 
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "attendance_summary_update" ON public.attendance_summary;
CREATE POLICY "attendance_summary_update" ON public.attendance_summary FOR UPDATE
USING (public.is_admin());

DROP POLICY IF EXISTS "attendance_summary_delete" ON public.attendance_summary;
CREATE POLICY "attendance_summary_delete" ON public.attendance_summary FOR DELETE
USING (public.is_admin());

-- PERFORMANCE METRICS POLICIES
DROP POLICY IF EXISTS "perf_metrics_select" ON public.performance_metrics;
CREATE POLICY "perf_metrics_select" ON public.performance_metrics FOR SELECT
USING (public.is_admin() OR auth.uid() = user_id);

DROP POLICY IF EXISTS "perf_metrics_insert" ON public.performance_metrics;
CREATE POLICY "perf_metrics_insert" ON public.performance_metrics FOR INSERT 
WITH CHECK (true); -- Allow all authenticated users to log metrics

DROP POLICY IF EXISTS "perf_metrics_delete" ON public.performance_metrics;
CREATE POLICY "perf_metrics_delete" ON public.performance_metrics FOR DELETE
USING (public.is_admin());

-- =====================================================================
-- SECTION 3: VERIFICATION
-- =====================================================================

-- Verify functions exist
SELECT 
  'public.get_user_role'::regprocedure,
  'public.get_user_email'::regprocedure,
  'public.is_admin'::regprocedure,
  'public.has_permission'::regprocedure;
