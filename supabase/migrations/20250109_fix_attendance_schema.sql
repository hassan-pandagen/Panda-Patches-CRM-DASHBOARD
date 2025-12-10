-- Migration: Fix Attendance Schema
-- Purpose: Drop old attendance_logs and sync to attendance_sessions
-- Date: 2025-01-09

-- CRITICAL: Remove old attendance table that's causing the error
DROP TABLE IF EXISTS public.attendance_logs CASCADE;
DROP TABLE IF EXISTS public.attendance_summary CASCADE;

-- Create attendance_sessions table with proper structure
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
  CONSTRAINT attendance_sessions_pkey PRIMARY KEY (id)
);

-- Create attendance_summary table
CREATE TABLE IF NOT EXISTS public.attendance_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  user_name text NOT NULL,
  month date NOT NULL,
  total_days_worked integer DEFAULT 0,
  total_hours numeric(8, 2) DEFAULT 0,
  late_days integer DEFAULT 0,
  overtime_hours numeric(8, 2) DEFAULT 0,
  undertime_hours numeric(8, 2) DEFAULT 0,
  incomplete_days integer DEFAULT 0,
  salary_status text DEFAULT 'PENDING',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT attendance_summary_user_month_unique UNIQUE (user_id, month)
);

-- Enable RLS
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_summary ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "attendance_sessions_select" ON public.attendance_sessions;
DROP POLICY IF EXISTS "attendance_sessions_insert" ON public.attendance_sessions;
DROP POLICY IF EXISTS "attendance_sessions_update" ON public.attendance_sessions;
DROP POLICY IF EXISTS "attendance_summary_select" ON public.attendance_summary;

-- Create RLS policies for attendance_sessions
CREATE POLICY "attendance_sessions_select"
ON public.attendance_sessions
FOR SELECT
USING (
  auth.uid() = user_id 
  OR 
  (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN'
);

CREATE POLICY "attendance_sessions_insert"
ON public.attendance_sessions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "attendance_sessions_update"
ON public.attendance_sessions
FOR UPDATE
USING (
  auth.uid() = user_id
  OR
  (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN'
);

-- Create RLS policies for attendance_summary
CREATE POLICY "attendance_summary_select"
ON public.attendance_summary
FOR SELECT
USING (
  auth.uid() = user_id
  OR
  (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'ADMIN'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_user_id ON public.attendance_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_user_email ON public.attendance_sessions(user_email);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_date ON public.attendance_sessions(work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_active ON public.attendance_sessions(user_id) WHERE clock_out_time IS NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_summary_user_id ON public.attendance_summary(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_summary_user_email ON public.attendance_summary(user_email);
CREATE INDEX IF NOT EXISTS idx_attendance_summary_month ON public.attendance_summary(month);
