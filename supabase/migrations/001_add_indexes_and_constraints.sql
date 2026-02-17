-- ============================================
-- PERFORMANCE INDEXES
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================

-- Orders table: speed up dashboard date-range queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);

-- Orders table: speed up sales agent filtering
CREATE INDEX IF NOT EXISTS idx_orders_sales_agent ON orders (sales_agent);

-- Orders table: speed up status-based filtering (AllOrdersPage tabs)
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);

-- Attendance: speed up date-range queries in admin panel
CREATE INDEX IF NOT EXISTS idx_attendance_work_date ON attendance_sessions (work_date DESC);

-- Attendance: speed up user-specific queries
CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance_sessions (user_id);

-- Attendance: speed up finding active sessions (clock_out_time IS NULL)
CREATE INDEX IF NOT EXISTS idx_attendance_active ON attendance_sessions (user_id) WHERE clock_out_time IS NULL;

-- Order history: speed up activity log queries
CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON order_history (order_id, changed_at DESC);

-- ============================================
-- TOCTOU PROTECTION: Prevent duplicate active sessions
-- This partial unique index ensures a user can only have ONE
-- active session (where clock_out_time IS NULL) at a time.
-- If two browser tabs try to clock in simultaneously, the second
-- INSERT will fail with a unique constraint violation (code 23505).
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_one_active_per_user
  ON attendance_sessions (user_id)
  WHERE clock_out_time IS NULL;
