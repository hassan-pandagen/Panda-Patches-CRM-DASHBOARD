// src/hooks/useClockInOut.ts
// PRODUCTION-READY: Industry-standard attendance system with Pakistan timezone
// Business: Denver client (MST), Team in Pakistan (PKT)

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { queryKeys } from '../constants/queryKeys';
import { AttendanceSession } from '../types';

// ============================================
// SHIFT CONFIGURATION - INDUSTRY STANDARD
// ============================================
export const SHIFT_CONFIG = {
  // Hours
  REQUIRED_HOURS: 8,           // Standard shift duration
  OVERTIME_THRESHOLD: 9,       // Hours after which overtime starts
  UNDERTIME_THRESHOLD: 7.5,    // Hours below which it's undertime
  MAX_SHIFT_HOURS: 10,         // Auto clock-out after this many hours
  
  // Timezone: Pakistan (PKT = UTC+5)
  // Denver (MST = UTC-7) business day ends ~5-6 PM
  // 6 PM Denver = 6 AM next day Pakistan
  // So cutoff at 5 AM PKT means:
  // - Clock in 5:00 AM - 11:59 PM → Current day's shift
  // - Clock in 12:00 AM - 4:59 AM → Previous day's shift (late night work)
  SHIFT_CUTOFF_HOUR: 5, // 5:00 AM PKT
  
  // Working days (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  WORKING_DAYS: [1, 2, 3, 4, 5, 6], // Monday to Saturday (Sunday off)
  
  // Status labels
  STATUS: {
    COMPLETED: 'COMPLETED',
    OVERTIME: 'OVERTIME',
    UNDERTIME: 'UNDERTIME',
    INCOMPLETE: 'INCOMPLETE',
    ABSENT: 'ABSENT',
    ACTIVE: 'ACTIVE',
  } as const,
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get current time in Pakistan timezone
 * This ensures consistent behavior regardless of user's browser timezone
 */
export const getPakistanTime = (date: Date = new Date()): Date => {
  // Convert to Pakistan time (UTC+5)
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const pktOffset = 5 * 60 * 60000; // UTC+5 in milliseconds
  return new Date(utc + pktOffset);
};

/**
 * Format date to YYYY-MM-DD string
 */
export const formatDateString = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Calculate the correct "work date" for attendance tracking.
 * 
 * BUSINESS RULE (Pakistan-based):
 * - Shift window: 5:00 AM to 4:59 AM next day (24-hour window)
 * - Clock in 5:00 AM - 11:59 PM → Work date = Current calendar date
 * - Clock in 12:00 AM - 4:59 AM → Work date = Previous calendar date
 * 
 * EXAMPLES (all times in PKT):
 * - Clock in at 7:00 PM Dec 29 → Work Date: Dec 29 ✓
 * - Clock in at 11:30 PM Dec 29 → Work Date: Dec 29 ✓
 * - Clock in at 2:00 AM Dec 30 → Work Date: Dec 29 (still Dec 29's shift)
 * - Clock in at 6:00 AM Dec 30 → Work Date: Dec 30 (new shift)
 */
export const calculateWorkDate = (clockInTime: Date): string => {
  const pktTime = getPakistanTime(clockInTime);
  const currentHour = pktTime.getHours();
  const workDateObj = new Date(pktTime);

  // If before cutoff hour (midnight to 4:59 AM), it belongs to previous day's shift
  if (currentHour < SHIFT_CONFIG.SHIFT_CUTOFF_HOUR) {
    workDateObj.setDate(workDateObj.getDate() - 1);
  }

  return formatDateString(workDateObj);
};

/**
 * Calculate session duration in hours
 */
export const calculateDuration = (clockIn: string, clockOut: string | null): number => {
  const start = new Date(clockIn).getTime();
  const end = clockOut ? new Date(clockOut).getTime() : Date.now();
  return (end - start) / (1000 * 60 * 60); // Convert ms to hours
};

/**
 * Determine attendance status based on hours worked
 */
export const determineStatus = (hours: number, isActive: boolean = false): string => {
  if (isActive) return SHIFT_CONFIG.STATUS.ACTIVE;
  if (hours === 0) return SHIFT_CONFIG.STATUS.INCOMPLETE;
  if (hours >= SHIFT_CONFIG.OVERTIME_THRESHOLD) return SHIFT_CONFIG.STATUS.OVERTIME;
  if (hours < SHIFT_CONFIG.UNDERTIME_THRESHOLD) return SHIFT_CONFIG.STATUS.UNDERTIME;
  return SHIFT_CONFIG.STATUS.COMPLETED;
};

/**
 * Check if a date is a working day (Monday-Saturday)
 */
export const isWorkingDay = (date: Date): boolean => {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  return SHIFT_CONFIG.WORKING_DAYS.includes(dayOfWeek);
};

/**
 * Check if session needs auto clock-out (exceeded max hours)
 */
export const needsAutoClockOut = (clockInTime: string): boolean => {
  const hoursElapsed = calculateDuration(clockInTime, null);
  return hoursElapsed >= SHIFT_CONFIG.MAX_SHIFT_HOURS;
};

/**
 * Get auto clock-out time (10 hours after clock-in)
 */
export const getAutoClockOutTime = (clockInTime: string): Date => {
  const clockIn = new Date(clockInTime);
  return new Date(clockIn.getTime() + (SHIFT_CONFIG.MAX_SHIFT_HOURS * 60 * 60 * 1000));
};

// ============================================
// DATA FETCHING FUNCTIONS
// ============================================

/**
 * Fetch all sessions for today's work date
 */
const fetchTodayAttendance = async (userId: string | undefined): Promise<AttendanceSession[]> => {
  if (!userId) return [];

  const workDate = calculateWorkDate(new Date());

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
 * Also handles auto clock-out for stale sessions
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
  
  // Check if session needs auto clock-out
  if (data && needsAutoClockOut(data.clock_in_time)) {
    // Auto clock-out this session
    const autoClockOutTime = getAutoClockOutTime(data.clock_in_time);
    
    await supabase
      .from('attendance_sessions')
      .update({ 
        clock_out_time: autoClockOutTime.toISOString(),
        auto_clocked_out: true, // Flag for admin visibility
      })
      .eq('id', data.id);
    
    // Return null since session is now closed
    return null;
  }
  
  return data;
};

/**
 * Fetch sessions that need attention (incomplete, auto-clocked-out)
 */
export const fetchSessionsNeedingAttention = async (): Promise<AttendanceSession[]> => {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .select('*')
    .or('clock_out_time.is.null,auto_clocked_out.eq.true')
    .order('clock_in_time', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
};

// ============================================
// MAIN HOOK
// ============================================
export const useClockInOut = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Query: Today's shift history - OPTIMIZED for performance
  // Reduced refetch frequency to minimize main thread blocking
  // staleTime: 2 minutes (was 30s)
  // refetchInterval: 2 minutes (was 60s)
  const { data: todaySessions = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: queryKeys.attendance.today(user?.id),
    queryFn: () => fetchTodayAttendance(user?.id),
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2, // 2 minutes (was 30s)
    refetchInterval: 1000 * 60 * 2, // 2 minutes (was 60s)
    refetchOnWindowFocus: false, // Don't refetch on tab switch
  });

  // Query: Active session status - OPTIMIZED for performance
  // Increased stale time to reduce background refetches
  // staleTime: 1 minute (was 0)
  // refetchInterval: 1 minute (was 30s)
  const { data: activeSession, isLoading: isLoadingStatus } = useQuery({
    queryKey: queryKeys.attendance.active(user?.id),
    queryFn: () => fetchCurrentActiveSession(user?.id),
    enabled: !!user?.id,
    staleTime: 1000 * 60, // 1 minute (was 0 - immediately stale)
    refetchOnWindowFocus: false, // Don't refetch on tab switch
    refetchInterval: 1000 * 60, // 1 minute (was 30s)
  });

  const isClockedIn = !!activeSession;
  const isLoading = isLoadingHistory || isLoadingStatus;

  // ============================================
  // CLOCK IN MUTATION
  // ============================================
  const clockInMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');

      // Check for existing active session
      const { data: existingActive, error: checkError } = await supabase
        .from('attendance_sessions')
        .select('id, clock_in_time, work_date')
        .eq('user_id', user.id)
        .is('clock_out_time', null)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingActive) {
        const hoursActive = calculateDuration(existingActive.clock_in_time, null);
        throw new Error(
          `You have an active session from ${new Date(existingActive.clock_in_time).toLocaleString()} (${hoursActive.toFixed(1)}h ago). Please clock out first.`
        );
      }

      const now = new Date();
      const workDate = calculateWorkDate(now);

      // Insert new session
      const { data: newSession, error: insertError } = await supabase
        .from('attendance_sessions')
        .insert({
          user_id: user.id,
          user_email: user.email!,
          user_name: user.user_metadata?.full_name || user.email,
          clock_in_time: now.toISOString(),
          work_date: workDate,
          auto_clocked_out: false,
        })
        .select()
        .single();

      // TOCTOU guard: catch unique constraint violation from concurrent tabs
      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error('You already have an active session (opened in another tab). Please refresh.');
        }
        throw insertError;
      }

      return { workDate, clockInTime: now, session: newSession };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all() });
    },
    retry: 1, // Network retry: retry once on transient failures
  });

  // ============================================
  // CLOCK OUT MUTATION
  // ============================================
  const clockOutMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');

      // Get active session
      const { data: currentActive, error: checkError } = await supabase
        .from('attendance_sessions')
        .select('*')
        .eq('user_id', user.id)
        .is('clock_out_time', null)
        .order('clock_in_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (checkError) throw checkError;

      if (!currentActive) {
        throw new Error('No active session found. You may already be clocked out.');
      }

      const clockOutTime = new Date();
      const hoursWorked = calculateDuration(currentActive.clock_in_time, clockOutTime.toISOString());
      
      // Cap hours at max shift hours if somehow exceeded
      const cappedHours = Math.min(hoursWorked, SHIFT_CONFIG.MAX_SHIFT_HOURS);

      // Update session (duration_hours is auto-calculated by database)
      const { data: updatedData, error: updateError } = await supabase
        .from('attendance_sessions')
        .update({ 
          clock_out_time: clockOutTime.toISOString(),
        })
        .eq('id', currentActive.id)
        .select()
        .single();

      if (updateError) throw updateError;

      return { sessionId: currentActive.id, data: updatedData, hoursWorked: cappedHours };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all() });
    },
    retry: 1, // Network retry: retry once on transient failures
  });

  // ============================================
  // COMPUTED VALUES
  // ============================================
  
  // Total hours worked today (including active session)
  const totalHoursToday = todaySessions.reduce((total, session) => {
    return total + calculateDuration(session.clock_in_time, session.clock_out_time);
  }, 0);

  // Time remaining to complete 8-hour shift
  const timeRemainingHours = Math.max(0, SHIFT_CONFIG.REQUIRED_HOURS - totalHoursToday);
  
  // Current session duration (if active)
  const currentSessionHours = activeSession 
    ? calculateDuration(activeSession.clock_in_time, null)
    : 0;

  // Warning if approaching auto clock-out
  const autoClockOutWarning = activeSession && currentSessionHours >= (SHIFT_CONFIG.MAX_SHIFT_HOURS - 1);

  // Today's status
  const todayStatus = determineStatus(totalHoursToday, isClockedIn);

  return {
    // Data
    todaySessions,
    activeSession,
    isClockedIn,
    isLoadingToday: isLoading,
    
    // Computed
    totalHoursToday,
    timeRemainingHours,
    currentSessionHours,
    autoClockOutWarning,
    todayStatus,
    
    // Actions
    clockIn: clockInMutation.mutate,
    isClockingIn: clockInMutation.isPending,
    clockInError: clockInMutation.error,
    
    clockOut: clockOutMutation.mutate,
    isClockingOut: clockOutMutation.isPending,
    clockOutError: clockOutMutation.error,
    
    // Config & Utils
    SHIFT_CONFIG,
    calculateWorkDate,
    determineStatus,
    isWorkingDay,
  };
};

// ============================================
// ADMIN REPORTING UTILITIES
// ============================================

export interface DailyReport {
  date: string;
  employee: string;
  email: string;
  clockIn: string;
  clockOut: string | null;
  hoursWorked: number;
  status: string;
  autoClockOut: boolean;
}

export interface WeeklyReport {
  employee: string;
  email: string;
  weekStart: string;
  weekEnd: string;
  totalDays: number;
  totalHours: number;
  overtimeHours: number;
  undertimeHours: number;
  absentDays: number;
  avgHoursPerDay: number;
}

export interface MonthlyReport {
  employee: string;
  email: string;
  month: string;
  totalDays: number;
  totalHours: number;
  overtimeHours: number;
  undertimeHours: number;
  absentDays: number;
  completedDays: number;
  avgHoursPerDay: number;
}

/**
 * Generate daily report from attendance records
 */
export const generateDailyReport = (records: AttendanceSession[]): DailyReport[] => {
  return records.map(record => {
    const hours = record.clock_out_time 
      ? calculateDuration(record.clock_in_time, record.clock_out_time)
      : calculateDuration(record.clock_in_time, null);
    
    const isActive = !record.clock_out_time;
    
    return {
      date: record.work_date,
      employee: record.user_name,
      email: record.user_email,
      clockIn: record.clock_in_time,
      clockOut: record.clock_out_time,
      hoursWorked: Math.min(hours, SHIFT_CONFIG.MAX_SHIFT_HOURS),
      status: determineStatus(hours, isActive),
      autoClockOut: record.auto_clocked_out || false,
    };
  });
};

/**
 * Calculate working days in a date range (excluding Sundays)
 */
export const getWorkingDaysInRange = (startDate: string, endDate: string): string[] => {
  const days: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    if (isWorkingDay(current)) {
      days.push(formatDateString(current));
    }
    current.setDate(current.getDate() + 1);
  }
  
  return days;
};

/**
 * Generate weekly report with absent tracking
 */
export const generateWeeklyReport = (
  records: AttendanceSession[], 
  employees: Array<{email: string, name: string}>,
  weekStart: string,
  weekEnd: string
): WeeklyReport[] => {
  const workingDays = getWorkingDaysInRange(weekStart, weekEnd);
  
  return employees.map(emp => {
    const empRecords = records.filter(r => r.user_email === emp.email);
    const workedDates = new Set(empRecords.map(r => r.work_date));
    
    let totalHours = 0;
    let overtimeHours = 0;
    let undertimeHours = 0;
    
    empRecords.forEach(record => {
      const hours = record.duration_hours || 0;
      totalHours += hours;
      
      if (hours >= SHIFT_CONFIG.OVERTIME_THRESHOLD) {
        overtimeHours += (hours - SHIFT_CONFIG.REQUIRED_HOURS);
      } else if (hours < SHIFT_CONFIG.UNDERTIME_THRESHOLD && hours > 0) {
        undertimeHours += (SHIFT_CONFIG.REQUIRED_HOURS - hours);
      }
    });
    
    const absentDays = workingDays.filter(d => !workedDates.has(d)).length;
    
    return {
      employee: emp.name,
      email: emp.email,
      weekStart,
      weekEnd,
      totalDays: empRecords.length,
      totalHours: Math.round(totalHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      undertimeHours: Math.round(undertimeHours * 100) / 100,
      absentDays,
      avgHoursPerDay: empRecords.length > 0 ? Math.round((totalHours / empRecords.length) * 100) / 100 : 0,
    };
  });
};

/**
 * Generate monthly report with comprehensive stats
 */
export const generateMonthlyReport = (
  records: AttendanceSession[],
  employees: Array<{email: string, name: string}>,
  month: string // YYYY-MM format
): MonthlyReport[] => {
  // Get first and last day of month
  const [year, monthNum] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNum - 1, 1);
  const lastDay = new Date(year, monthNum, 0);
  
  const monthStart = formatDateString(firstDay);
  const monthEnd = formatDateString(lastDay);
  const workingDays = getWorkingDaysInRange(monthStart, monthEnd);
  
  return employees.map(emp => {
    const empRecords = records.filter(r => 
      r.user_email === emp.email && r.work_date.startsWith(month)
    );
    const workedDates = new Set(empRecords.map(r => r.work_date));
    
    let totalHours = 0;
    let overtimeHours = 0;
    let undertimeHours = 0;
    let completedDays = 0;
    
    empRecords.forEach(record => {
      const hours = record.duration_hours || 0;
      totalHours += hours;
      
      if (hours >= SHIFT_CONFIG.OVERTIME_THRESHOLD) {
        overtimeHours += (hours - SHIFT_CONFIG.REQUIRED_HOURS);
        completedDays++;
      } else if (hours >= SHIFT_CONFIG.UNDERTIME_THRESHOLD) {
        completedDays++;
      } else if (hours < SHIFT_CONFIG.UNDERTIME_THRESHOLD && hours > 0) {
        undertimeHours += (SHIFT_CONFIG.REQUIRED_HOURS - hours);
      }
    });
    
    const absentDays = workingDays.filter(d => !workedDates.has(d)).length;
    
    return {
      employee: emp.name,
      email: emp.email,
      month,
      totalDays: empRecords.length,
      totalHours: Math.round(totalHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      undertimeHours: Math.round(undertimeHours * 100) / 100,
      absentDays,
      completedDays,
      avgHoursPerDay: empRecords.length > 0 ? Math.round((totalHours / empRecords.length) * 100) / 100 : 0,
    };
  });
};

export default useClockInOut;
