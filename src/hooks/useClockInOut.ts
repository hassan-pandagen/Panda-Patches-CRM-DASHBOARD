// src/hooks/useClockInOut.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startOfDay, endOfDay } from 'date-fns';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { queryKeys } from '../constants/queryKeys';
import { AttendanceSession } from '../types'; 

export const SHIFT_CONFIG = {
  REQUIRED_HOURS: 8,
  OVERTIME_THRESHOLD: 8.5,
  UNDERTIME_THRESHOLD: 7.5,
};

// 1. Fetch Today's History (For the list view)
const fetchTodayAttendance = async (userId: string | undefined): Promise<AttendanceSession[]> => {
  if (!userId) return [];

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

// 2. Fetch ANY Active Session (For the status check)
// This finds a session where clock_out_time IS NULL, regardless of date
const fetchCurrentActiveSession = async (userId: string | undefined): Promise<AttendanceSession | null> => {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('user_id', userId)
    .is('clock_out_time', null)
    .maybeSingle(); // Use maybeSingle to avoid 406 errors

  if (error) throw error;
  return data;
};

export const useClockInOut = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Query A: Today's History
  const { data: todaySessions = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: queryKeys.attendance.today(user?.id),
    queryFn: () => fetchTodayAttendance(user?.id),
    enabled: !!user?.id,
    staleTime: 1000 * 60, // 1 minute
  });

  // Query B: Current Status (The Truth Source)
  const { data: activeSession, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['attendance', 'active', user?.id],
    queryFn: () => fetchCurrentActiveSession(user?.id),
    enabled: !!user?.id,
    // Critical: Keep this fresh
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const isClockedIn = !!activeSession;
  const isLoading = isLoadingHistory || isLoadingStatus;
  // --- CLOCK IN ---
  const clockInMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      // Double check client-side state
      if (isClockedIn) throw new Error('You are already clocked in.');

      const now = new Date();
      
      // Overnight Logic: If before 7AM, count as previous day
      const currentHour = now.getHours();
      const workDateObj = new Date(now);

      if (currentHour < 7) {
        workDateObj.setDate(workDateObj.getDate() - 1);
      }

      const workDate = workDateObj.toISOString().split('T')[0];

      const { error } = await supabase
        .from('attendance_sessions')
        .insert({
          user_id: user.id,
          user_email: user.email!,
          user_name: user.user_metadata.full_name || user.email,
          clock_in_time: now.toISOString(),
          work_date: workDate,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      // Refresh everything
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all() });
      queryClient.invalidateQueries({ queryKey: ['attendance', 'active'] });
    },
  });
  // --- CLOCK OUT ---
  const clockOutMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      // Use the activeSession from our dedicated query, not the list
      if (!activeSession) throw new Error('No active session found.');

      const { error } = await supabase
        .from('attendance_sessions')
        .update({ clock_out_time: new Date().toISOString() })
        .eq('id', activeSession.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all() });
      queryClient.invalidateQueries({ queryKey: ['attendance', 'active'] });
    },
  });

  return {
    todaySessions,
    activeSession,
    isClockedIn,
    isLoadingToday: isLoading,
    clockIn: clockInMutation.mutate,
    isClockingIn: clockInMutation.isPending,
    clockInError: clockInMutation.error,
    clockOut: clockOutMutation.mutate,
    isClockingOut: clockOutMutation.isPending,
    clockOutError: clockOutMutation.error,
    SHIFT_CONFIG,
  };
};