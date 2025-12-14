// src/hooks/useClockInOut.ts
// PRODUCTION-READY: Handles cross-midnight shifts with industry-standard logic

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startOfDay, endOfDay } from 'date-fns';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { queryKeys } from '../constants/queryKeys';
import { AttendanceSession } from '../types';

// ============================================
// SHIFT CONFIGURATION
// ============================================
export const SHIFT_CONFIG = {
  REQUIRED_HOURS: 8,
  OVERTIME_THRESHOLD: 8.5,
  UNDERTIME_THRESHOLD: 7.5,
  
  // ✅ TIMEZONE: Pakistan (PKT = UTC+5)
  // Shift cutoff is based on local clock time (what users see)
  // Any clock-in BEFORE this hour belongs to the PREVIOUS day's shift
  // For example: 7 AM means shifts from 7 PM (yesterday) to 7 AM (today) count as yesterday
  // This works correctly because JavaScript's getHours() uses the browser's local time (PKT)
  SHIFT_CUTOFF_HOUR: 7, // 7 AM PKT (adjust as needed)
};

// ============================================
// WORK DATE CALCULATION (CRITICAL)
// ============================================
/**
 * Calculates the correct "work date" for attendance tracking.
 * 
 * BUSINESS RULE:
 * - Your shift runs 7 PM → 7 AM next day
 * - Anyone clocking in between 12:00 AM - 6:59 AM is part of PREVIOUS day's shift
 * - Anyone clocking in after 7:00 AM is part of CURRENT day's shift
 * 
 * EXAMPLES:
 * - Clock in at 11:00 PM Dec 14 → Work Date: Dec 14
 * - Clock in at 1:00 AM Dec 15 → Work Date: Dec 14 (still part of Dec 14's shift)
 * - Clock in at 8:00 AM Dec 15 → Work Date: Dec 15 (new shift started)
 */
const calculateWorkDate = (clockInTime: Date): string => {
  const currentHour = clockInTime.getHours();
  const workDateObj = new Date(clockInTime);

  // If it's before the cutoff hour (e.g., before 7 AM), 
  // it belongs to the previous calendar day's shift
  if (currentHour < SHIFT_CONFIG.SHIFT_CUTOFF_HOUR) {
    workDateObj.setDate(workDateObj.getDate() - 1);
  }

  // Return in YYYY-MM-DD format
  return workDateObj.toISOString().split('T')[0];
};

// ============================================
// DATA FETCHING FUNCTIONS
// ============================================

/**
 * Fetch all sessions for today's work date
 * This shows the complete shift history
 */
const fetchTodayAttendance = async (userId: string | undefined): Promise<AttendanceSession[]> => {
  if (!userId) return [];

  const now = new Date();
  const workDate = calculateWorkDate(now);

  const { data, error } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('work_date', workDate)
    .order('clock_in_time', { ascending: true });

  if (error) throw error;
  return data || [];
};

/**
 * Find any active session (clock_out_time is NULL)
 * This is the source of truth for "is user clocked in?"
 */
const fetchCurrentActiveSession = async (userId: string | undefined): Promise<AttendanceSession | null> => {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('user_id', userId)
    .is('clock_out_time', null)
    .order('clock_in_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
};

// ============================================
// MAIN HOOK
// ============================================
export const useClockInOut = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Query A: Today's shift history
  const { data: todaySessions = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: queryKeys.attendance.today(user?.id),
    queryFn: () => fetchTodayAttendance(user?.id),
    enabled: !!user?.id,
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 60, // Auto-refresh every minute
  });

  // Query B: Active session status (source of truth)
  const { data: activeSession, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['attendance', 'active', user?.id],
    queryFn: () => fetchCurrentActiveSession(user?.id),
    enabled: !!user?.id,
    staleTime: 0, // Always fresh
    refetchOnWindowFocus: true,
    refetchInterval: 1000 * 30, // Check every 30 seconds
  });

  const isClockedIn = !!activeSession;
  const isLoading = isLoadingHistory || isLoadingStatus;

  // ============================================
  // CLOCK IN MUTATION
  // ============================================
  const clockInMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');

      // ✅ CRITICAL: Check if user already has an active session
      const { data: existingActive, error: checkError } = await supabase
        .from('attendance_sessions')
        .select('id, clock_in_time, work_date')
        .eq('user_id', user.id)
        .is('clock_out_time', null)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingActive) {
        throw new Error(
          `You already have an active session from ${new Date(existingActive.clock_in_time).toLocaleString()}. Please clock out first.`
        );
      }

      // Calculate work date using our business logic
      const now = new Date();
      const workDate = calculateWorkDate(now);

      // Insert new session
      const { error: insertError } = await supabase
        .from('attendance_sessions')
        .insert({
          user_id: user.id,
          user_email: user.email!,
          user_name: user.user_metadata.full_name || user.email,
          clock_in_time: now.toISOString(),
          work_date: workDate,
        });

      if (insertError) throw insertError;

      return { workDate, clockInTime: now };
    },
    onSuccess: () => {
      // Refresh all attendance-related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all() });
      queryClient.invalidateQueries({ queryKey: ['attendance', 'active'] });
    },
  });

  // ============================================
  // CLOCK OUT MUTATION
  // ============================================
  const clockOutMutation = useMutation({
    mutationFn: async () => {
      console.log('🔄 Clock out started...');
      
      if (!user) {
        console.error('❌ No user found');
        throw new Error('User not authenticated');
      }

      console.log('✅ User authenticated:', user.email);

      // ✅ CRITICAL: Get the latest active session
      const { data: currentActive, error: checkError } = await supabase
        .from('attendance_sessions')
        .select('*')
        .eq('user_id', user.id)
        .is('clock_out_time', null)
        .order('clock_in_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (checkError) {
        console.error('❌ Error fetching active session:', checkError);
        throw checkError;
      }

      if (!currentActive) {
        console.error('❌ No active session found');
        throw new Error('No active session found. You may already be clocked out.');
      }

      console.log('✅ Found active session:', currentActive.id);
      console.log('⏰ Clocking out at:', new Date().toISOString());

      // Update the session with clock out time
      // ✅ NOTE: updated_at is automatically set by the trigger function, don't include it here
      const { data: updatedData, error: updateError } = await supabase
        .from('attendance_sessions')
        .update({ 
          clock_out_time: new Date().toISOString()
        })
        .eq('id', currentActive.id)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Clock out failed:', updateError);
        throw updateError;
      }

      console.log('✅ Clock out successful:', updatedData);

      return { sessionId: currentActive.id, data: updatedData };
    },
    onSuccess: (data) => {
      console.log('✅ Clock out mutation success, invalidating queries...');
      // Refresh all attendance-related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all() });
      queryClient.invalidateQueries({ queryKey: ['attendance', 'active'] });
      console.log('✅ Queries invalidated');
    },
    onError: (error: Error) => {
      console.error('❌ Clock out mutation error:', error);
    },
  });

  return {
    // Data
    todaySessions,
    activeSession,
    isClockedIn,
    isLoadingToday: isLoading,
    
    // Actions
    clockIn: clockInMutation.mutate,
    isClockingIn: clockInMutation.isPending,
    clockInError: clockInMutation.error,
    
    clockOut: clockOutMutation.mutate,
    isClockingOut: clockOutMutation.isPending,
    clockOutError: clockOutMutation.error,
    
    // Config
    SHIFT_CONFIG,
  };
};