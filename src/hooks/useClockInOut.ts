// src/hooks/useClockInOut.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startOfDay, endOfDay } from 'date-fns';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { queryKeys } from '../constants/queryKeys';
import { AttendanceSession } from '../types'; // Assuming you'll add this type

export const SHIFT_CONFIG = {
  REQUIRED_HOURS: 8,
  OVERTIME_THRESHOLD: 8.5,
  UNDERTIME_THRESHOLD: 7.5,
};

/**
 * Fetches all attendance sessions for the current user for today.
 */
const fetchTodayAttendance = async (userId: string): Promise<AttendanceSession[]> => {
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();

  const { data, error } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('clock_in_time', todayStart)
    .lte('clock_in_time', todayEnd)
    .order('clock_in_time', { ascending: true });

  if (error) throw error;
  return data || [];
};

/**
 * Finds the currently active (not clocked out) session for the user.
 */
const findActiveSession = async (userId: string): Promise<AttendanceSession | null> => {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('user_id', userId)
    .is('clock_out_time', null)
    .single();

  // If no rows are returned, data will be null, and error.code might be 'PGRST116'.
  // We only throw if it's an actual error, not just no results.
  if (error && data === null) {
    return null;
  }
  if (error) {
    throw error;
  }
  return data;
};

export const useClockInOut = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: todaySessions = [], isLoading: isLoadingToday } = useQuery({
    queryKey: queryKeys.attendance.today(user?.id),
    queryFn: () => fetchTodayAttendance(user!.id),
    enabled: !!user,
    // Aggressive refetching to ensure data is always fresh on navigation/focus
    staleTime: 10 * 1000, // Data is considered stale after 10 seconds
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const activeSession = todaySessions.find(s => s.clock_out_time === null);
  const isClockedIn = !!activeSession;

  const clockInMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      if (isClockedIn) throw new Error('You are already clocked in.');

      const now = new Date();

      // --- START OVERNIGHT FIX ---
      // Logic: If the current time is before 7 AM (the shift cutoff),
      // we consider this shift as belonging to the previous calendar day.
      const currentHour = now.getHours();
      const workDateObj = new Date(now);

      // If it is between 12:00 AM and 6:59 AM, subtract 1 day from the date.
      if (currentHour < 7) {
        workDateObj.setDate(workDateObj.getDate() - 1);
      }

      // Create the final YYYY-MM-DD string for the "logical" work date.
      const workDate = workDateObj.toISOString().split('T')[0];
      // --- END OVERNIGHT FIX ---

      const { data, error } = await supabase
        .from('attendance_sessions')
        .insert({
          user_id: user.id,
          user_email: user.email!,
          user_name: user.user_metadata.full_name || user.email,
          clock_in_time: now.toISOString(), // Keep exact timestamp for calculation
          work_date: workDate, // Save the "Logical" date (e.g., Dec 11)
        });

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate both the user's specific 'today' query and the general admin list
      return queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all() });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      const sessionToClockOut = await findActiveSession(user.id);
      if (!sessionToClockOut) throw new Error('No active session to clock out from.');

      const { data, error } = await supabase
        .from('attendance_sessions')
        .update({ clock_out_time: new Date().toISOString() })
        .eq('id', sessionToClockOut.id);

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate both the user's specific 'today' query and the general admin list
      return queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all() });
    },
  });

  return {
    todaySessions,
    activeSession,
    isClockedIn,
    isLoadingToday,
    clockIn: clockInMutation.mutate,
    isClockingIn: clockInMutation.isPending,
    clockInError: clockInMutation.error,
    clockOut: clockOutMutation.mutate,
    isClockingOut: clockOutMutation.isPending,
    clockOutError: clockOutMutation.error,
    SHIFT_CONFIG,
  };
};
